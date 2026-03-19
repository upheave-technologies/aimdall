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

## The Module Barrel Boundary

Every module exports a barrel (`index.ts`) that is its **only public API**. The barrel exports pre-wired use cases, session utilities, and re-exported types. Everything else — the composition root, repositories, domain internals, use case factories — is private to the module.

**Files in `app/` (server actions, pages, layouts, routes) MUST import exclusively from module barrels.** They must NEVER import from:
- `modules/*/infrastructure/` (composition root, repositories, session internals)
- `modules/*/domain/` (types, validation — re-exported through the barrel)
- `modules/*/application/` (use case factories — pre-wired through the barrel)
- `packages/@core/*` (core packages — re-exported through the barrel)

This is the most commonly violated rule. If a server action needs a use case, it imports the pre-wired instance from the barrel. If it needs a type, the barrel re-exports it. There is no reason for `app/` code to reach past the barrel.

## The Repository Boundary

All external access — databases, APIs, file storage, third-party services — is encapsulated behind repository interfaces. The domain layer defines what it needs (the interface). The infrastructure layer provides how it works (the implementation). Use cases orchestrate repositories; they never access external services directly.

If code touches a database, calls an API, or reads from storage, it must be inside a repository implementation in the infrastructure layer.
