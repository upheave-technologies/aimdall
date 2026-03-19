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

## The Repository Boundary

All external access — databases, APIs, file storage, third-party services — is encapsulated behind repository interfaces. The domain layer defines what it needs (the interface). The infrastructure layer provides how it works (the implementation). Use cases orchestrate repositories; they never access external services directly.

This is the most commonly violated rule. If code touches a database, calls an API, or reads from storage, it must be inside a repository implementation in the infrastructure layer.
