---
paths:
  - "**/actions.ts"
  - "**/actions.tsx"
---

# Server Action & App Layer Rules

You are writing code in the app layer (Next.js routes, server actions, pages, layouts). This layer is a THIN ADAPTER — it connects HTTP/UI to module use cases. It contains ZERO business logic.

## The Iron Rule

**Files in `app/` import ONLY from module barrels.** A module barrel is the `index.ts` at the module root (e.g., `@/modules/nucleus`).

```typescript
// ✅ CORRECT — import from the module barrel
import { register, getProfile, type ActionResult } from '@/modules/nucleus';

// ❌ FORBIDDEN — import from module internals
import { nucleus } from '@/modules/nucleus/infrastructure/nucleus';
import { makeRegisterUseCase } from '@/modules/nucleus/application/registerUseCase';
import { getSessionPrincipalId } from '@/modules/nucleus/infrastructure/session';
import type { Principal } from '@/packages/@core/identity';
```

**NEVER import from:**
- `modules/*/infrastructure/` — composition root, repositories, session internals are PRIVATE
- `modules/*/domain/` — types are re-exported through the barrel
- `modules/*/application/` — use case factories are pre-wired through the barrel
- `packages/@core/*` — core types are re-exported through the barrel

The architecture-guard hook BLOCKS these imports. Do not attempt to bypass it.

## Server Actions Are Thin Adapters

A server action does exactly 4 things and NOTHING else:

1. **Extract input** — read FormData fields or function parameters
2. **Validate presence** — check required fields exist (NOT business validation)
3. **Call ONE use case** — a single pre-wired function from the module barrel
4. **Return result** — map the Result to ActionResult for the UI

```typescript
'use server';

import { register, setSession, type ActionResult } from '@/modules/nucleus';

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

Pages and layouts in `app/` follow the same barrel-only import rule:

```typescript
// ✅ CORRECT
import { getProfile, buildAbility, getSessionPrincipalId } from '@/modules/nucleus';

export default async function DashboardPage() {
  const principalId = await getSessionPrincipalId();
  if (!principalId) redirect('/login');
  const result = await getDashboardContext({ principalId });
  // ... render
}
```
