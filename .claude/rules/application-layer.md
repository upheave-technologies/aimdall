---
paths:
  - "**/application/**"
---

# Application Layer Rules

You are working in the application layer — the orchestrator. This layer coordinates domain logic and infrastructure to execute use cases. It contains no business logic itself.

## What belongs here
- Use case functions: one per file, named `{verb}{Entity}UseCase.ts` (e.g., `createCampaignUseCase.ts`)
- Module-scoped error classes (e.g., `campaignError.ts`)
- Input/output type definitions for use cases

## The use case pattern
Every use case is a higher-order function that receives its dependencies (repositories) and returns an async function:

```typescript
export const makeCreateEntityUseCase = (
  entityRepository: IEntityRepository
) => {
  return async (data: CreateEntityInput): Promise<Result<Entity, ModuleError>> => {
    // 1. Fetch existing data via repositories
    // 2. Call domain functions for validation/business rules
    // 3. Persist results via repositories
    // 4. Return Result
  };
};
```

## Absolute restrictions
- One use case per file. Multiple `makeXUseCase` exports in a single file is forbidden.
- No business logic. Validation, state transitions, and business decisions are delegated to domain layer functions.
- No direct external access. Use cases access databases, APIs, and storage only through repository interfaces — never directly.
- No service classes. Use higher-order functions, not `class XService {}`.
