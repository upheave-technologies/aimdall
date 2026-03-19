#!/bin/bash

# Version: 2
# =============================================================================
# Architecture Guard - PreToolUse Hook
# =============================================================================
# Enforces DDD layer boundaries and clean architecture rules.
# Checks the CONTENT being written against rules based on FILE LOCATION.
#
# Deployed in agent frontmatter (frankie, donnie, nexus) so it fires
# for every code-writing agent.
#
# The strict data flow:
#   Frontend (_components, _containers)
#     → Server Actions (actions.ts)
#       → UseCases (application/)
#         → Repositories (infrastructure/repositories/)
#           → External Services (prisma, APIs, storage)
#
# Each layer can ONLY call the layer directly below it. No shortcuts.
#
# Rules:
#   1. Component Purity:        _components/ = pure JSX, NO hooks/state
#   2. Prisma Boundary:         prisma ONLY in infrastructure/repositories/
#   3. Action Boundary:         actions.ts can ONLY call useCases
#   4. UseCase Boundary:        useCases use repositories for external access
#   5. Frontend Boundary:       components/containers call ONLY server actions
#   6. Service Class Detection: no class XService/Controller/Manager/Handler/Provider
#   7. One UseCase Per File:    application/*UseCase* files contain exactly one make*UseCase
#   8. Domain Layer Purity:     domain/ files cannot import infrastructure/ or application/
#   9. Cross-Module Import Guard: @core modules are blind to each other (Axiom of Isolation)
#  10. Zombie Shield:           repository read queries must include soft-delete filter (WARN)
#  11. Page Component Boundary: page.tsx = server component, single child component, no raw JSX
#  12. 'use client' Containment: 'use client' only in _containers/ or error.tsx
#  13. Server-First Fetching:  useEffect(…,[]) in containers is forbidden — fetch on server
#  14. Client Container Purity: _containers/ with 'use client' = slim state proxy, no raw JSX
# =============================================================================

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Skip non-source files — architecture rules apply to code, not documentation or config.
# Markdown, YAML, JSON, plain text, and shell scripts are exempt.
case "$FILE_PATH" in
  *.md|*.mdx|*.yml|*.yaml|*.json|*.txt|*.sh|*.env|*.env.*|*.lock|*.toml|*.ini|*.cfg|*.conf)
    exit 0
    ;;
esac

# Extract content being written/edited
if [ "$TOOL_NAME" = "Write" ]; then
  CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')
elif [ "$TOOL_NAME" = "Edit" ]; then
  CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')
else
  exit 0
fi

if [ -z "$CONTENT" ]; then
  exit 0
fi

# =============================================================================
# Helpers
# =============================================================================

deny() {
  local rule="$1"
  local violation="$2"
  local fix="$3"
  jq -n \
    --arg fp "$FILE_PATH" \
    --arg rule "$rule" \
    --arg violation "$violation" \
    --arg fix "$fix" \
    '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: (
          "ARCHITECTURE GUARD — " + $rule + "\n\n" +
          "File: " + $fp + "\n" +
          "Violation: " + $violation + "\n\n" +
          "Required: " + $fix
        )
      }
    }'
  exit 0
}

warn() {
  local rule="$1"
  local violation="$2"
  local fix="$3"
  jq -n \
    --arg fp "$FILE_PATH" \
    --arg rule "$rule" \
    --arg violation "$violation" \
    --arg fix "$fix" \
    '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: (
          "ARCHITECTURE GUARD WARNING — " + $rule + "\n\n" +
          "File: " + $fp + "\n" +
          "Warning: " + $violation + "\n\n" +
          "Recommended: " + $fix
        )
      }
    }'
  # exit 0 allows the write to proceed
  exit 0
}

# Check content for a pattern (exit 0 = found)
content_has() {
  printf '%s' "$CONTENT" | grep -qE "$1" 2>/dev/null
}

# Get matching lines for error messages
content_matches() {
  printf '%s' "$CONTENT" | grep -nE "$1" 2>/dev/null | head -5 || true
}

# =============================================================================
# Detect architectural layer from file path
# =============================================================================

IS_COMPONENT=false
IS_CONTAINER=false
IS_ACTION=false
IS_USECASE=false
IS_REPOSITORY=false
IS_FRONTEND=false
IS_DOMAIN=false
IS_PAGE=false

IS_ERROR_BOUNDARY=false

if [[ "$FILE_PATH" == */_components/* ]]; then IS_COMPONENT=true; IS_FRONTEND=true; fi
if [[ "$FILE_PATH" == */_containers/* ]]; then IS_CONTAINER=true; IS_FRONTEND=true; fi
if [[ "$FILE_PATH" == */actions.ts ]] || [[ "$FILE_PATH" == */actions.tsx ]]; then IS_ACTION=true; fi
if [[ "$FILE_PATH" == */application/* ]] || [[ "$FILE_PATH" == *use-case* ]] || [[ "$FILE_PATH" == *UseCase* ]]; then IS_USECASE=true; fi
if [[ "$FILE_PATH" == */infrastructure/repositories/* ]] || [[ "$FILE_PATH" == */infrastructure/repository/* ]]; then IS_REPOSITORY=true; fi
if [[ "$FILE_PATH" == */domain/* ]] && [[ "$FILE_PATH" != *Repository* ]]; then IS_DOMAIN=true; fi
if [[ "$FILE_PATH" == */page.tsx ]]; then IS_PAGE=true; fi
if [[ "$FILE_PATH" == */error.tsx ]]; then IS_ERROR_BOUNDARY=true; fi


# =============================================================================
# RULE 1: Component Purity
# _components/ files must be PURE presentational — no hooks, no state.
# Only exception: useFormStatus (for pending form states)
# =============================================================================

if [ "$IS_COMPONENT" = true ]; then
  HOOK_PATTERN="(useState|useEffect|useReducer|useMemo|useCallback|useRef|useContext|useQuery|useMutation|useTransition|useOptimistic|useRouter|usePathname|useSearchParams|useLayoutEffect)"

  if content_has "$HOOK_PATTERN"; then
    FOUND=$(content_matches "$HOOK_PATTERN")
    deny \
      "COMPONENT PURITY" \
      "Components in _components/ must be PURE presentational. No hooks, no state, no side effects.\n${FOUND}" \
      "Move ALL hooks and state logic to a Container in _containers/. The Container passes data down as props. Components ONLY receive props and render JSX. The only allowed hook is useFormStatus."
  fi
fi

# =============================================================================
# RULE 2: Prisma ONLY in Repositories
# Prisma client can ONLY be imported and used in repository files inside
# infrastructure/repositories/. Nowhere else. Ever.
#
# NOTE: Pattern strings are assembled from fragments at runtime so that
# this hook file itself does not contain the literal banned strings and
# therefore does not trip its own scan when being written.
# =============================================================================

if [ "$IS_REPOSITORY" = false ]; then
  PRISMA_PKG="@prisma/client"
  PRISMA_NEW="new Prisma"
  PRISMA_CLASS="PrismaClient"
  PRISMA_IMPORT="from '.*prisma'"
  PRISMA_IMPORT2='from ".*prisma"'
  PRISMA_CALL='prisma\.[a-zA-Z]+\.'
  PRISMA_PATTERN="${PRISMA_PKG}|${PRISMA_IMPORT}|${PRISMA_IMPORT2}|${PRISMA_CALL}|${PRISMA_NEW}Client|${PRISMA_CLASS}"

  if content_has "$PRISMA_PATTERN"; then
    FOUND=$(content_matches "$PRISMA_PATTERN")
    deny \
      "PRISMA BOUNDARY" \
      "Prisma can ONLY be used inside Repository files (infrastructure/repositories/). Found prisma usage in a non-repository file.\n${FOUND}" \
      "Create or use a Repository method in modules/<module>/infrastructure/repositories/. The data flow is: action → useCase → repository → prisma. No shortcuts."
  fi
fi

# =============================================================================
# RULE 3: Server Actions → Module Barrel ONLY
# actions.ts files (and any file in app/) can ONLY import from module barrels
# (e.g., @/modules/nucleus). They must NEVER import from:
#   - Module internals (infrastructure/, domain/, application/)
#   - Core packages (@core/identity, @core/auth, @core/iam)
#   - Repositories, composition roots, or any infrastructure detail
#
# This is the most commonly violated rule. The composition root is an
# implementation detail of the module — server actions must not know it exists.
# =============================================================================

IS_APP_FILE=false
if [[ "$FILE_PATH" == */app/* ]] || [[ "$FILE_PATH" == app/* ]]; then IS_APP_FILE=true; fi

if [ "$IS_ACTION" = true ] || [ "$IS_APP_FILE" = true ]; then
  # No infrastructure imports (composition root, session internals, repositories)
  if content_has "from.*infrastructure/|from.*infrastructure'|from.*infrastructure\""; then
    FOUND=$(content_matches "from.*infrastructure")
    deny \
      "MODULE BOUNDARY — NO INFRASTRUCTURE IMPORTS" \
      "Files in app/ must NOT import from infrastructure/ directly.\n${FOUND}" \
      "Import from the module barrel only (e.g., import { myUseCase } from '@/modules/mymodule'). The composition root, repositories, and session utilities are internal to the module."
  fi

  # No domain layer imports
  if content_has "from.*modules/.*/domain/"; then
    FOUND=$(content_matches "from.*modules/.*/domain/")
    deny \
      "MODULE BOUNDARY — NO DOMAIN IMPORTS" \
      "Files in app/ must NOT import from a module's domain/ layer directly.\n${FOUND}" \
      "Import types from the module barrel (e.g., import { type ActionResult } from '@/modules/mymodule'). The module barrel re-exports all public types."
  fi

  # No application layer imports (use cases should come via barrel, not directly)
  if content_has "from.*modules/.*/application/"; then
    FOUND=$(content_matches "from.*modules/.*/application/")
    deny \
      "MODULE BOUNDARY — NO APPLICATION IMPORTS" \
      "Files in app/ must NOT import from a module's application/ layer directly.\n${FOUND}" \
      "Import pre-wired use cases from the module barrel (e.g., import { register } from '@/modules/mymodule'). The barrel wires use case factories to the composition root internally."
  fi

  # No core package imports
  if content_has "from.*packages/@core/|from.*@core/"; then
    FOUND=$(content_matches "from.*packages/@core/|from.*@core/")
    deny \
      "MODULE BOUNDARY — NO CORE PACKAGE IMPORTS" \
      "Files in app/ must NOT import from core packages directly.\n${FOUND}" \
      "Import from the module barrel only. The module barrel re-exports any core types that consumers need (e.g., type Principal, type Policy)."
  fi

  # No repository imports
  if content_has "import.*[Rr]epository|from.*infrastructure/repositories|from.*infrastructure/repository"; then
    FOUND=$(content_matches "[Rr]epository|infrastructure/repositor")
    deny \
      "ACTION LAYER BOUNDARY" \
      "Server Actions must NOT import Repositories directly.\n${FOUND}" \
      "Actions can ONLY call UseCases via the module barrel."
  fi

  # No direct HTTP/fetch/axios calls
  if content_has "(^|[^a-zA-Z])fetch\s*\(|from ['\"]axios['\"]|axios\.(get|post|put|delete|patch|request)"; then
    FOUND=$(content_matches "fetch\s*\(|axios")
    deny \
      "ACTION LAYER BOUNDARY" \
      "Server Actions must NOT make direct HTTP/API calls.\n${FOUND}" \
      "Actions can ONLY call UseCases. Move the external service call into a UseCase → Repository chain."
  fi
fi

# =============================================================================
# RULE 4: UseCases → Repositories ONLY for external access
# UseCases contain business logic and orchestrate repositories.
# They must NOT directly call external services (fetch, axios, etc).
# =============================================================================

if [ "$IS_USECASE" = true ]; then
  # No direct HTTP/fetch/axios calls
  if content_has "(^|[^a-zA-Z])fetch\s*\(|from ['\"]axios['\"]|axios\.(get|post|put|delete|patch|request)"; then
    FOUND=$(content_matches "fetch\s*\(|axios")
    deny \
      "USE CASE LAYER BOUNDARY" \
      "UseCases must NOT make direct HTTP/API calls.\n${FOUND}" \
      "Use a Repository for ALL external service access. Create a method in the appropriate repository in infrastructure/repositories/."
  fi
fi

# =============================================================================
# RULE 5: Frontend → Server Actions ONLY
# Components and containers must NOT import from backend layers.
# No prisma, no repositories, no useCases, no direct API calls.
# They can ONLY call Server Actions defined in actions.ts.
# =============================================================================

if [ "$IS_FRONTEND" = true ]; then
  # No useCase imports
  if content_has "import.*[Uu]se[Cc]ase|from.*application/|from.*use-case"; then
    FOUND=$(content_matches "[Uu]se[Cc]ase|application/|use-case")
    deny \
      "FRONTEND LAYER BOUNDARY" \
      "Frontend code must NOT import UseCases directly.\n${FOUND}" \
      "Frontend can ONLY call Server Actions (from actions.ts). The Server Action calls the UseCase internally."
  fi

  # No repository imports
  if content_has "import.*[Rr]epository|from.*infrastructure"; then
    FOUND=$(content_matches "[Rr]epository|infrastructure")
    deny \
      "FRONTEND LAYER BOUNDARY" \
      "Frontend code must NOT import from the infrastructure layer.\n${FOUND}" \
      "Frontend can ONLY call Server Actions. The data flow is: component → action → useCase → repository."
  fi

  # No direct fetch/axios
  if content_has "(^|[^a-zA-Z])fetch\s*\(|from ['\"]axios['\"]|axios\.(get|post|put|delete|patch|request)"; then
    FOUND=$(content_matches "fetch\s*\(|axios")
    deny \
      "FRONTEND LAYER BOUNDARY" \
      "Frontend code must NOT make direct HTTP/API calls.\n${FOUND}" \
      "Use a Server Action instead. Define the action in actions.ts and call it from the component/container."
  fi
fi

# =============================================================================
# RULE 6: Service Class Detection
# This project uses higher-order factory functions, never service classes.
# Error classes (extending Error) are the ONLY allowed class pattern.
#
# Blocked:  export class UserService { ... }
# Blocked:  export default class AuthController { ... }
# Allowed:  export class AccessError extends Error { ... }
# =============================================================================

SERVICE_CLASS_PATTERN="export[[:space:]]+(default[[:space:]]+)?class[[:space:]]+[A-Za-z]+(Service|Controller|Manager|Handler|Provider)[[:space:]]"

if content_has "$SERVICE_CLASS_PATTERN"; then
  # Filter out lines that are error subclasses — those are allowed
  FOUND=$(printf '%s' "$CONTENT" | grep -nE "$SERVICE_CLASS_PATTERN" 2>/dev/null | grep -vE "extends[[:space:]]+Error" | head -5 || true)

  if [ -n "$FOUND" ]; then
    deny \
      "SERVICE CLASS FORBIDDEN" \
      "Service classes are not allowed in this project. Found:\n${FOUND}" \
      "Use the higher-order function pattern: export const makeXUseCase = (deps) => { return async (input) => { ... }; };"
  fi
fi

# =============================================================================
# RULE 7: One Use Case Per File
# Files in */application/*UseCase* (or *use-case*) paths must export exactly
# ONE make*UseCase function. Multiple use cases in a single file are the
# monolithic service anti-pattern.
# =============================================================================

if [[ "$FILE_PATH" == */application/*UseCase* ]] || [[ "$FILE_PATH" == */application/*use-case* ]]; then
  USECASE_COUNT=$(printf '%s' "$CONTENT" | grep -cE "export[[:space:]]+const[[:space:]]+make[A-Z][a-zA-Z]*UseCase" 2>/dev/null || true)

  if [ "$USECASE_COUNT" -gt 1 ]; then
    FOUND=$(content_matches "export[[:space:]]+const[[:space:]]+make[A-Z][a-zA-Z]*UseCase")
    deny \
      "ONE USE CASE PER FILE" \
      "This file defines ${USECASE_COUNT} use cases. Only 1 is allowed per file.\n${FOUND}" \
      "Each use case gets its own file. Split into separate files like createXUseCase.ts and updateXUseCase.ts"
  fi
fi

# =============================================================================
# RULE 8: Domain Layer Purity
# Files in */domain/* (excluding *Repository.ts) must not import from
# infrastructure/ or application/ layers. The domain depends on nothing
# outside itself and shared utilities.
# =============================================================================

if [ "$IS_DOMAIN" = true ]; then
  DOMAIN_IMPURE_PATTERN="from[[:space:]]+['\"].*infrastructure/|from[[:space:]]+['\"].*application/"

  if content_has "$DOMAIN_IMPURE_PATTERN"; then
    FOUND=$(content_matches "$DOMAIN_IMPURE_PATTERN")
    deny \
      "DOMAIN LAYER PURITY" \
      "Domain files cannot import from infrastructure/ or application/ layers.\n${FOUND}" \
      "Domain layer is pure — it depends on nothing outside itself and shared utilities. Move infrastructure concerns to the infrastructure layer."
  fi
fi

# =============================================================================
# RULE 9: Cross-Module Import Guard (Axiom of Isolation)
# Core modules inside packages/@core/ are blind to each other.
# A module may only import from itself or from packages/shared/.
# Cross-module communication is handled by the Application Layer using
# Soft Links (plain text UUIDs) — never by direct imports.
#
# Blocked:  packages/@core/auth/ importing from packages/@core/iam/
# Allowed:  packages/@core/auth/ importing from packages/shared/
#
# Implementation note: BASH_REMATCH is set by the [[ =~ ]] operator in the
# current shell process. We use a temp file for the while-read loop so that
# [[ =~ ]] runs in the same shell (not a subshell), preserving BASH_REMATCH.
# =============================================================================

if [[ "$FILE_PATH" =~ packages/@core/([^/]+)/ ]]; then
  CURRENT_MODULE="${BASH_REMATCH[1]}"

  # Write matching import lines to a temp file so the while-read loop runs
  # in the current shell, keeping BASH_REMATCH accessible.
  _TMPFILE=$(mktemp)
  printf '%s' "$CONTENT" | grep -E "from[[:space:]]+['\"].*@core/[^'\"]+['\"]" > "$_TMPFILE" 2>/dev/null || true

  while IFS= read -r import_line; do
    IMPORTED_MODULE=""

    if [[ "$import_line" =~ packages/@core/([^/]+) ]]; then
      IMPORTED_MODULE="${BASH_REMATCH[1]}"
    elif [[ "$import_line" =~ @core/([^/\"\']+) ]]; then
      IMPORTED_MODULE="${BASH_REMATCH[1]}"
    fi

    # Skip lines where we could not identify the imported module
    [ -z "$IMPORTED_MODULE" ] && continue

    # Allow: same module, or the shared package
    if [ "$IMPORTED_MODULE" = "$CURRENT_MODULE" ] || [ "$IMPORTED_MODULE" = "shared" ]; then
      continue
    fi

    rm -f "$_TMPFILE"
    deny \
      "AXIOM OF ISOLATION — CROSS-MODULE IMPORT FORBIDDEN" \
      "Module '@core/${CURRENT_MODULE}' must not import from '@core/${IMPORTED_MODULE}'.\nViolating line: ${import_line}" \
      "Axiom of Isolation: Core modules are blind to each other. Use Soft Links (plain text UUIDs) for cross-module references. The Application Layer orchestrates cross-module interactions."

  done < "$_TMPFILE"

  rm -f "$_TMPFILE"
fi

# =============================================================================
# RULE 10: Zombie Shield Enforcement  (WARN — does NOT block writes)
# Repository files that contain SELECT/read queries must include a
# soft-delete filter (isNull / deletedAt / deleted_at). This is a heuristic:
# if a read query pattern is present but no soft-delete guard is found
# anywhere in the content being written, emit a warning and allow the write.
# =============================================================================

if [ "$IS_REPOSITORY" = true ]; then
  READ_QUERY_PATTERN="\.select\(|\.findFirst\(|\.findMany\(|findById|findBy[A-Z]"

  if content_has "$READ_QUERY_PATTERN"; then
    SOFTDELETE_PATTERN="isNull|deletedAt|deleted_at"

    if ! content_has "$SOFTDELETE_PATTERN"; then
      FOUND=$(content_matches "$READ_QUERY_PATTERN")
      warn \
        "ZOMBIE SHIELD — SOFT-DELETE FILTER MISSING" \
        "This repository file contains read queries but no soft-delete filter (isNull / deletedAt / deleted_at) was detected.\nRead query lines:\n${FOUND}" \
        "Add a soft-delete guard to all SELECT/find queries. Example (Drizzle): where(and(eq(table.id, id), isNull(table.deletedAt))). This prevents deleted records from appearing in results."
    fi
  fi
fi

# =============================================================================
# RULE 11: Page Component Boundary
# Files matching */page.tsx must be Server Components that only orchestrate
# data and delegate rendering to a single child component. They must NOT:
#   a) carry a 'use client' directive (pages are always server components)
#   b) call any React hook (hooks belong in _containers/)
#   c) contain raw HTML JSX tags (markup belongs in _components/ or _containers/)
# =============================================================================

if [ "$IS_PAGE" = true ]; then

  # 11a: No 'use client' directive in pages
  if content_has "^['\"]use client['\"]"; then
    FOUND=$(content_matches "^['\"]use client['\"]")
    deny \
      "PAGE COMPONENT BOUNDARY — NO USE CLIENT" \
      "Page files must be Server Components. The 'use client' directive is forbidden in page.tsx.\n${FOUND}" \
      "Move all client-side logic (state, hooks, event handlers) to a Container in _containers/. The page fetches data server-side and passes it as props to the Container or Component."
  fi

  # 11b: No React hooks in pages
  PAGE_HOOK_PATTERN="(useState|useEffect|useReducer|useMemo|useCallback|useRef|useContext|useQuery|useMutation|useTransition|useOptimistic|useRouter|usePathname|useSearchParams|useLayoutEffect|useFormStatus)"

  if content_has "$PAGE_HOOK_PATTERN"; then
    FOUND=$(content_matches "$PAGE_HOOK_PATTERN")
    deny \
      "PAGE COMPONENT BOUNDARY — NO HOOKS IN PAGES" \
      "Page files must not use React hooks. Found hooks in page.tsx.\n${FOUND}" \
      "Move all hooks and state management to a Container in _containers/. The page.tsx is a Server Component — it fetches data and delegates rendering."
  fi

  # 11c: No raw HTML JSX tags in pages
  RAW_HTML_PATTERN="<(div|form|input|button|section|ul|ol|li|span|p|h[1-6]|table|thead|tbody|tr|td|th|label|select|option|textarea|dl|dt|dd|nav|header|footer|main|article|aside)[[:space:]>/]"

  if content_has "$RAW_HTML_PATTERN"; then
    FOUND=$(content_matches "$RAW_HTML_PATTERN")
    deny \
      "PAGE COMPONENT BOUNDARY — NO RAW HTML JSX IN PAGES" \
      "Page files must not contain raw HTML JSX. Found HTML elements directly in page.tsx.\n${FOUND}" \
      "Extract all JSX into a Component in _components/ or a Container in _containers/. The page should return a single component: return <MyPageView data={data} />;"
  fi

fi

# =============================================================================
# RULE 12: 'use client' Containment
# The 'use client' directive is ONLY allowed in:
#   - Files inside _containers/ directories
#   - error.tsx files (Next.js requires error boundaries to be client components)
# Everywhere else, server components are the default.
# =============================================================================

if [ "$IS_CONTAINER" = false ] && [ "$IS_ERROR_BOUNDARY" = false ]; then
  if content_has "^['\"]use client['\"]"; then
    FOUND=$(content_matches "^['\"]use client['\"]")
    deny \
      "USE CLIENT CONTAINMENT" \
      "The 'use client' directive is only allowed in _containers/ files (and error.tsx boundaries). Found 'use client' outside an allowed location.\n${FOUND}" \
      "Move all client-side logic (state, hooks, event handlers, browser APIs) into a Container file inside _containers/. Server Components are the default — only opt into client when you genuinely need interactivity."
  fi
fi

# =============================================================================
# RULE 13: Server-First Data Fetching (DENY)
# Containers that use useEffect with an empty dependency array are doing
# mount-only data fetching. In the App Router, data fetching belongs
# in Server Components — never in client-side effects. There is no valid
# reason to fetch data via useEffect or the use() hook.
# =============================================================================

if [ "$IS_CONTAINER" = true ]; then
  MOUNT_EFFECT_PATTERN="useEffect\([^)]*,[[:space:]]*\[\]"

  if content_has "$MOUNT_EFFECT_PATTERN"; then
    FOUND=$(content_matches "$MOUNT_EFFECT_PATTERN")
    deny \
      "SERVER-FIRST DATA FETCHING" \
      "Found useEffect with empty dependency array — this is mount-only data fetching that MUST happen on the server.\n${FOUND}" \
      "Move data fetching to the Server Component (page.tsx or a server container) and pass the data as props. There is no valid reason to fetch data via useEffect in this project."
  fi
fi

# =============================================================================
# RULE 14: Client Container Purity
# CLIENT containers (_containers/ files with 'use client') are slim state
# proxies. They manage client state, hooks, and event handlers, then delegate
# ALL rendering to components in _components/. Client containers must NOT
# contain raw HTML JSX tags — markup belongs in _components/.
#
# Server containers (no 'use client') MAY contain light composition markup.
# =============================================================================

if [ "$IS_CONTAINER" = true ]; then
  # Only enforce for client containers — check if content has 'use client'
  if content_has "^['\"]use client['\"]"; then
    CONTAINER_HTML_PATTERN="<(div|form|input|button|section|ul|ol|li|span|p|h[1-6]|table|thead|tbody|tr|td|th|label|select|option|textarea|dl|dt|dd|nav|header|footer|main|article|aside)[[:space:]>/]"

    if content_has "$CONTAINER_HTML_PATTERN"; then
      FOUND=$(content_matches "$CONTAINER_HTML_PATTERN")
      deny \
        "CLIENT CONTAINER PURITY — NO RAW HTML JSX" \
        "Client containers must be slim state proxies that delegate rendering to components. Found raw HTML JSX directly in a client container file.\n${FOUND}" \
        "Extract all JSX markup into a presentational Component in _components/. The client container manages state and event handlers, then passes data as props to the component. A client container's return should be a single component call: return <MyView data={data} onSubmit={handleSubmit} />;"
    fi
  fi
fi

# =============================================================================
# All checks passed
# =============================================================================

exit 0
