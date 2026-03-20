---
# No paths: loads unconditionally for ALL agents working in this project.
---

# DDD Architecture Rules

This project uses Domain-Driven Design with a functional, data-oriented approach. These rules apply to every file and every agent.

## The Data Flow (No Shortcuts)

```
Frontend (components/containers)
  → Server Actions (actions.ts)
    → Use Cases (application/)
      → Repositories (infrastructure/repositories/)
        → External Services (database, APIs, storage, 3rd party)
```

Each layer calls only the layer directly below it. Skipping layers is an architectural violation.

## The Six Rules

1. **Structure by business domain, not by technology.** Organize folders by business capability (campaigns/, brands/, iam/), not by technical role (controllers/, services/, models/).

2. **Three layers inside each module: domain, application, infrastructure.** Every module follows this internal structure consistently.

3. **Dependencies point inward only.** Infrastructure depends on application and domain. Application depends on domain. Domain depends on nothing external — it is completely self-contained.

4. **Prefer functional, data-oriented patterns.** Use pure functions and TypeScript types/interfaces instead of classes. Use higher-order functions for dependency injection instead of class constructors.

5. **Business logic lives exclusively in the domain layer.** Validation rules, state transitions, and business decisions belong in domain. Database queries, API calls, and framework code belong in infrastructure. These concerns never mix.

6. **YAGNI applies to features, not to architecture.** Build only what the task requires. But always use the layered structure — it is the foundation that makes future change low-cost.

## The Module Public API Boundary

Modules use **fully direct imports** — there is no `index.ts` barrel, no `use-cases.ts` composition file, and no re-export files of any kind. Every import goes to the source file where the code lives. Each use case file exports its own pre-wired instance.

### Allowed imports from `app/`

- **`@/modules/{module}/application/{verb}{Entity}UseCase`** — pre-wired use case instance (each use case from its own file)
- **`@/modules/{module}/domain/types`** — public domain type definitions
- **`@/modules/{module}/infrastructure/session`** — session utilities
- **`@/packages/@core/*`** — core types (Principal, Policy, etc.) imported directly from core packages

### Still forbidden from `app/`

Everything else inside a module is private:
- `modules/*/infrastructure/nucleus` — composition root
- `modules/*/infrastructure/repositories/*` — repository implementations
- `modules/*/infrastructure/*` (other than `infrastructure/session`) — adapters, database files
- `modules/*/domain/*` (other than `domain/types`) — business logic functions, repository interfaces, error types

This is the most commonly violated rule. If a server action needs a use case, it imports the pre-wired instance directly from the use case file (e.g., `@/modules/nucleus/application/registerUseCase`). If it needs a type, it imports from `domain/types`. If it needs session utilities, it imports from `infrastructure/session`. Core types come directly from `@/packages/@core/*`.

## The Repository Boundary

All external access — databases, APIs, file storage, third-party services — is encapsulated behind repository interfaces. The domain layer defines what it needs (the interface). The infrastructure layer provides how it works (the implementation). Use cases orchestrate repositories; they never access external services directly.

If code touches a database, calls an API, or reads from storage, it must be inside a repository implementation in the infrastructure layer.
