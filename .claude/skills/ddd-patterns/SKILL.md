---
name: ddd-patterns
description: "DDD code patterns and examples for domain, application, and infrastructure layers. Reference when implementing any module following layered architecture."
---

# DDD Implementation Patterns

Use these patterns when implementing modules. Adapt naming and import paths to match the project's existing conventions. Always read at least one existing module before writing code.

## Module folder structure

```
{module}/
├── index.ts                              # Barrel: public API only
├── domain/
│   ├── {entity}.ts                       # Types + pure validation/business functions
│   ├── {entity}Repository.ts             # Repository contract (interface only)
│   └── errors.ts                         # Domain error types (optional)
├── application/
│   ├── {module}Error.ts                  # Module-scoped error class
│   └── {verb}{Entity}UseCase.ts          # One file per use case
├── infrastructure/
│   ├── database.ts                       # Database type definition
│   ├── {Framework}{Adapter}.ts           # Framework-specific adapters
│   └── repositories/
│       └── {ORM}{Entity}Repository.ts    # Implements domain interface
└── schema/
    ├── index.ts
    ├── enums.ts
    ├── {table}.ts
    └── relations.ts
```

## Result type

```typescript
export type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };
```

Always narrow before accessing branches:
```typescript
const result = validate(data);
if (!result.success) return result;       // TypeScript knows .error exists
const value = result.value;               // TypeScript knows .value exists
```

## Domain entity

All types and pure functions for one entity in one file:

```typescript
// domain/{entity}.ts
import { Result } from '{shared}/result';

export type Campaign = {
  id: string;
  brandId: string;
  name: string;
  budget: number;
  createdAt: Date;
};

export const createCampaign = (
  name: string,
  budget: number
): Result<Partial<Campaign>, Error> => {
  if (!name || name.trim().length === 0) {
    return { success: false, error: new Error("Campaign name cannot be empty.") };
  }
  if (budget <= 0) {
    return { success: false, error: new Error("Campaign budget must be positive.") };
  }
  return { success: true, value: { name, budget } };
};
```

## Repository interface

Contract only — defines what, not how:

```typescript
// domain/{entity}Repository.ts
import { Campaign } from "./campaign";

export type ICampaignRepository = {
  save: (campaign: Campaign) => Promise<void>;
  findByName: (name: string) => Promise<Campaign | null>;
};
```

## Use case

Higher-order function, one per file:

```typescript
// application/create{Entity}UseCase.ts
import { createCampaign, Campaign } from '../domain/campaign';
import { ICampaignRepository } from '../domain/campaignRepository';
import { Result } from '{shared}/result';

export const makeCreateCampaignUseCase = (
  campaignRepository: ICampaignRepository
) => {
  return async (data: {
    brandId: string;
    name: string;
    budget: number;
  }): Promise<Result<Campaign, Error>> => {
    const existing = await campaignRepository.findByName(data.name);
    if (existing) {
      return { success: false, error: new Error("Already exists.") };
    }

    const campaignResult = createCampaign(data.name, data.budget);
    if (!campaignResult.success) return campaignResult;

    const campaign: Campaign = {
      id: crypto.randomUUID(),
      brandId: data.brandId,
      name: campaignResult.value.name!,
      budget: campaignResult.value.budget!,
      createdAt: new Date(),
    };

    await campaignRepository.save(campaign);
    return { success: true, value: campaign };
  };
};
```

Multiple repositories as separate parameters when needed:
```typescript
export const makeAssignCreatorUseCase = (
  campaignRepo: ICampaignRepository,
  assignmentRepo: IAssignmentRepository  // separate dependency, never collapsed
) => { /* ... */ };
```

## Repository implementation

Factory function with soft-delete filter on every read:

```typescript
// infrastructure/repositories/{ORM}{Entity}Repository.ts
import { eq, and, isNull } from 'drizzle-orm';

export const makeCampaignRepository = (db: DatabaseType): ICampaignRepository => ({
  async findByName(name: string): Promise<Campaign | null> {
    const result = await db.select().from(campaigns)
      .where(and(eq(campaigns.name, name), isNull(campaigns.deletedAt)))
      .limit(1);
    if (result.length === 0) return null;
    return mapToCampaign(result[0]);
  },

  async save(campaign: Campaign): Promise<void> {
    await db.insert(campaigns).values({ /* ... */ });
  },
});
```

## Module error class

```typescript
// application/{module}Error.ts
export class CampaignError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'CampaignError';
  }
}
```

## Barrel export

Public API only — one export per symbol:

```typescript
// index.ts
export { makeCampaignRepository } from './infrastructure/repositories/...';
export { makeCreateCampaignUseCase } from './application/createCampaignUseCase';
export type { Campaign } from './domain/campaign';
export { CampaignError } from './application/campaignError';
```

## API route (thin adapter)

Routes wire dependencies and translate HTTP. No business logic:

```typescript
// app/api/campaigns/route.ts
import { makeCreateCampaignUseCase } from '.../application/createCampaignUseCase';
import { PostgresCampaignRepository } from '.../infrastructure/PostgresCampaignRepository';

export async function POST(request: NextRequest) {
  const useCase = makeCreateCampaignUseCase(PostgresCampaignRepository);
  const body = await request.json();
  const result = await useCase({ brandId: body.brandId, name: body.name, budget: body.budget });

  if (result.success) {
    return NextResponse.json(result.value, { status: 201 });
  }
  return NextResponse.json({ error: result.error.message }, { status: 400 });
}
```
