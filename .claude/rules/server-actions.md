---
paths:
  - "**/actions.ts"
  - "**/actions.tsx"
---

# Server Action & App Layer Rules

You are writing code in the app layer (Next.js routes, server actions, pages, layouts). This layer is a THIN ADAPTER — it connects HTTP/UI to module use cases. It contains ZERO business logic.

## The Iron Rule

**Files in `app/` use fully direct imports from source files.** There is no barrel file, no `use-cases.ts`, and no re-export files — every import goes directly to the source file where the code lives.

```typescript
// ✅ CORRECT — direct imports from source files
import { register } from '@/modules/nucleus/application/registerUseCase';
import { setSession } from '@/modules/nucleus/infrastructure/session';
import type { ActionResult } from '@/modules/nucleus/domain/types';

// ❌ FORBIDDEN — import from private internals
import { nucleus } from '@/modules/nucleus/infrastructure/nucleus';
```

**Allowed import paths:**
- `modules/*/application/{verb}{Entity}UseCase` — pre-wired use case instance (each use case from its own file)
- `modules/*/domain/types` — public type definitions
- `modules/*/infrastructure/session` — session utilities
- `packages/@core/*` — core types (Principal, Policy, etc.)

**Forbidden import paths:**
- `modules/*/infrastructure/nucleus` — composition root is PRIVATE
- `modules/*/infrastructure/repositories/*` — repository implementations are PRIVATE
- `modules/*/infrastructure/*` (other than `infrastructure/session`) — adapters, database files are PRIVATE
- `modules/*/domain/*` (other than `domain/types`) — business logic functions, repository interfaces are PRIVATE

The architecture-guard hook BLOCKS forbidden imports. Do not attempt to bypass it.

## Server Actions Are Thin Adapters

A server action does exactly 4 things and NOTHING else:

1. **Extract input** — read FormData fields or function parameters
2. **Validate presence** — check required fields exist (NOT business validation)
3. **Call ONE use case** — a single pre-wired function from its use case file
4. **Return result** — map the Result to ActionResult for the UI

```typescript
'use server';

import { register } from '@/modules/nucleus/application/registerUseCase';
import { setSession } from '@/modules/nucleus/infrastructure/session';
import type { ActionResult } from '@/modules/nucleus/domain/types';

export async function registerAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  // 1. Extract input
  const name = formData.get('name') as string;
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  // 2. Validate presence (NOT business rules)
  if (!name || !email || !password) {
    return { success: false, error: 'All fields are required', code: 'VALIDATION_ERROR' };
  }

  // 3. Call ONE use case
  const result = await register({ name, email, password });

  // 4. Return result
  if (!result.success) {
    return { success: false, error: result.error.message, code: result.error.code };
  }

  await setSession(result.value.id);
  return { success: true, data: { id: result.value.id } };
}
```

## What Business Logic Looks Like (NEVER do this in actions)

```typescript
// ❌ FORBIDDEN — business logic in a server action
export async function suspendIfInactive(formData: FormData) {
  const member = await getMember({ id: formData.get('id') as string });
  if (member.success && member.data.lastLoginAt < thirtyDaysAgo) {  // ← BUSINESS RULE!
    await suspendMember({ id: member.data.id });
  }
}

// ✅ CORRECT — move the logic to a use case
export async function suspendIfInactiveAction(formData: FormData) {
  const id = formData.get('id') as string;
  if (!id) return { success: false, error: 'ID required', code: 'VALIDATION_ERROR' };
  const result = await suspendIfInactive({ id });  // use case owns the business rule
  if (!result.success) return { success: false, error: result.error.message, code: result.error.code };
  return { success: true, data: { suspended: true } };
}
```

**How to tell if you're writing business logic:**
- Comparing dates, amounts, or thresholds → business logic
- Checking entity status/state before deciding what to do → business logic
- Conditional branching based on data values (not just null checks) → business logic
- Calling multiple use cases in sequence with logic between them → orchestration (belongs in a use case)
- String manipulation, data transformation beyond simple mapping → business logic

All of this belongs in a use case, not in a server action.

## Server Component Pages Follow the Same Rules

Pages and layouts in `app/` follow the same direct-import rules:

```typescript
// ✅ CORRECT
import { getProfile } from '@/modules/nucleus/application/getProfileUseCase';
import { buildAbility } from '@/modules/nucleus/application/buildAbilityUseCase';
import { getSessionPrincipalId } from '@/modules/nucleus/infrastructure/session';

export default async function DashboardPage() {
  const principalId = await getSessionPrincipalId();
  if (!principalId) redirect('/login');
  const result = await getDashboardContext({ principalId });
  // ... render
}
```
