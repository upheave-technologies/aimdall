---
# No paths: loads unconditionally for ALL agents working in this project.
---

# Project Structure — Top-Level Directory Placement

## Directory Layout

| Directory | Owns | Examples |
|-----------|------|----------|
| `packages/@core/` | Nucleus core infrastructure (identity, auth, iam, session, tenancy, membership) | `packages/@core/identity/`, `packages/@core/iam/` |
| `packages/shared/` | Shared utilities, types, helpers used across all packages | `packages/shared/result.ts` |
| `modules/` | Business domain modules — application-specific features | `modules/campaigns/`, `modules/products/` |
| `app/` | Next.js routes, pages, layouts, server actions | `app/(app)/campaigns/page.tsx` |
| `registry/` | Nucleus CLI registry — building block definitions and presets | `registry/index.yml` |
| `system/` | Documentation, axioms, context files | `system/axioms/philosophy.md` |

## Key Rules

1. **Business domain modules ALWAYS go in `modules/{module-name}/`.** They follow the standard DDD internal structure (domain/, application/, infrastructure/). If you are implementing a feature tied to a business capability — campaigns, products, orders, etc. — the module lives in `modules/`, not `packages/`.

2. **`modules/` imports from `packages/`, never the reverse.** Core packages are intentionally agnostic — they never reference business modules. Dependency flows one way: `modules/` → `packages/`.

## Internal Structure

Both `packages/@core/{module}/` and `modules/{module-name}/` use the same DDD layered structure internally:

```
{module}/
├── domain/          # Types + pure business functions + repository interfaces
├── application/     # Use case orchestration
└── infrastructure/  # Repositories, adapters, ORM implementations
```

See `ddd-architecture.md` for the full layer rules.

## Module Public API

Modules use **fully direct imports** — there is NO `index.ts` barrel, NO `use-cases.ts` composition file, and NO re-export files of any kind. Every import goes to the source file where the code lives. Each use case file exports its own pre-wired instance.

### Allowed import paths from `app/`

| Import path | What it provides | Example |
|-------------|-----------------|---------|
| `@/modules/{module}/application/{verb}{Entity}UseCase` | Pre-wired use case instance (each use case from its own file) | `import { register } from '@/modules/nucleus/application/registerUseCase'` |
| `@/modules/{module}/domain/types` | Public domain types | `import type { ActionResult } from '@/modules/nucleus/domain/types'` |
| `@/modules/{module}/infrastructure/session` | Session utilities | `import { setSession } from '@/modules/nucleus/infrastructure/session'` |
| `@/packages/@core/*` | Core types (Principal, Policy, etc.) | `import type { Principal } from '@/packages/@core/identity'` |

## NEVER

- NEVER create a business domain module inside `packages/`. Business logic belongs in `modules/`.
- NEVER import from `modules/` inside any `packages/` file. Dependency flows one way: modules → packages.
- NEVER create new top-level directories without explicit approval.
- NEVER import from `modules/*/infrastructure/*` in `app/` files — EXCEPT `infrastructure/session` (session utilities are a public surface).
- NEVER import from `modules/*/infrastructure/nucleus` (composition root) in `app/` files.
- NEVER import from `modules/*/infrastructure/repositories/*` in `app/` files.
- NEVER import from `modules/*/domain/*` in `app/` files — EXCEPT `domain/types` (public type definitions are a public surface).
- NEVER create `index.ts` barrel files, `use-cases.ts` composition files, or re-export files of any kind.
