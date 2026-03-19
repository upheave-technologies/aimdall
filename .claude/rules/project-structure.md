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

## Module Barrel Exports

Every module in `modules/` MUST have an `index.ts` barrel that serves as its **only public API**. The barrel:
- Exports pre-wired use case instances (not factories)
- Re-exports session utilities and domain types consumers need
- Re-exports core types (Principal, Policy, etc.) so consumers never import from `packages/@core/` directly
- Does NOT export the composition root, repositories, or internal implementation details

**Files in `app/` import ONLY from the barrel** (e.g., `import { register, type ActionResult } from '@/modules/nucleus'`). This is enforced by the architecture-guard hook.

## NEVER

- NEVER create a business domain module inside `packages/`. Business logic belongs in `modules/`.
- NEVER import from `modules/` inside any `packages/` file. Dependency flows one way: modules → packages.
- NEVER create new top-level directories without explicit approval.
- NEVER import from `modules/*/infrastructure/`, `modules/*/domain/`, or `modules/*/application/` in `app/` files. Use the module barrel only.
- NEVER import from `packages/@core/*` in `app/` files. Use the module barrel only.
