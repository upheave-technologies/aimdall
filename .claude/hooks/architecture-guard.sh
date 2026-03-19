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
# =============================================================================

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

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

if [[ "$FILE_PATH" == */_components/* ]]; then IS_COMPONENT=true; IS_FRONTEND=true; fi
if [[ "$FILE_PATH" == */_containers/* ]]; then IS_CONTAINER=true; IS_FRONTEND=true; fi
if [[ "$FILE_PATH" == */actions.ts ]] || [[ "$FILE_PATH" == */actions.tsx ]]; then IS_ACTION=true; fi
if [[ "$FILE_PATH" == */application/* ]] || [[ "$FILE_PATH" == *use-case* ]] || [[ "$FILE_PATH" == *UseCase* ]]; then IS_USECASE=true; fi
if [[ "$FILE_PATH" == */infrastructure/repositories/* ]] || [[ "$FILE_PATH" == */infrastructure/repository/* ]]; then IS_REPOSITORY=true; fi
if [[ "$FILE_PATH" == */domain/* ]] && [[ "$FILE_PATH" != *Repository* ]]; then IS_DOMAIN=true; fi

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
# RULE 3: Server Actions → UseCases ONLY
# actions.ts can ONLY import and call UseCases from the application layer.
# No direct repository access. No direct prisma. No direct fetch/HTTP.
# =============================================================================

if [ "$IS_ACTION" = true ]; then
  # No repository imports
  if content_has "import.*[Rr]epository|from.*infrastructure/repositories|from.*infrastructure/repository"; then
    FOUND=$(content_matches "[Rr]epository|infrastructure/repositor")
    deny \
      "ACTION LAYER BOUNDARY" \
      "Server Actions must NOT import Repositories directly.\n${FOUND}" \
      "Actions can ONLY call UseCases. Import from modules/<module>/application/ and call a UseCase. The UseCase will access the repository."
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
# All checks passed
# =============================================================================

exit 0
