# @core/identity

The Identity module is the system's single source of truth for who can act. It owns the full lifecycle of a **Principal** — any entity (human, AI agent, or internal system worker) that can authenticate and take actions.

## What this module owns

- Principal creation, retrieval, update, suspension, reactivation, and soft-deletion
- Status lifecycle enforcement: `active` → `suspended` → `deactivated` (with valid/invalid transition rules)
- Domain validation: name length, email format (RFC 5321), metadata size cap (64 KB)
- Zombie Shield: all repository reads filter soft-deleted records automatically

## What this module does NOT own

| Concern | Module |
|---|---|
| Password hashing, OAuth tokens, API key verification | `@core/auth` |
| Session tokens, JWT minting, refresh rotation | `@core/session` |
| Tenant membership, role assignments | `@core/membership` |
| Authorization policies, permission checks | `@core/iam` |

---

## Quick Start

```typescript
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as identitySchema from '@core/identity/schema';
import {
  makePrincipalRepository,
  makeCreatePrincipalUseCase,
} from '@core/identity';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema: identitySchema });

const repo = makePrincipalRepository(db);
const createPrincipal = makeCreatePrincipalUseCase(repo);

const result = await createPrincipal({
  type: 'human',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
});

if (result.success) {
  console.log(result.value.id); // cuid2 string
} else {
  console.error(result.error.code, result.error.message);
}
```

---

## API Reference

### Repository Factory

| Export | Signature | Description |
|---|---|---|
| `makePrincipalRepository` | `(db: IdentityDatabase) => IPrincipalRepository` | Creates a Drizzle-backed Principal repository |

### Use Case Factories

| Export | Input | Returns | Description |
|---|---|---|---|
| `makeCreatePrincipalUseCase` | `{ type, name, email?, metadata? }` | `Result<Principal, IdentityError>` | Creates and persists a new Principal |
| `makeGetPrincipalUseCase` | `{ id }` | `Result<Principal, IdentityError>` | Retrieves an active Principal by ID |
| `makeGetPrincipalByEmailUseCase` | `{ email }` | `Result<Principal, IdentityError>` | Retrieves an active Principal by email |
| `makeUpdatePrincipalUseCase` | `{ id, name?, email?, metadata? }` | `Result<Principal, IdentityError>` | Updates mutable fields on an active Principal |
| `makeSuspendPrincipalUseCase` | `{ id }` | `Result<Principal, IdentityError>` | Transitions status to `suspended` |
| `makeReactivatePrincipalUseCase` | `{ id }` | `Result<Principal, IdentityError>` | Transitions status from `suspended` back to `active` |
| `makeDeactivatePrincipalUseCase` | `{ id }` | `Result<void, IdentityError>` | Permanently deactivates via soft delete |

### Domain Types

| Export | Description |
|---|---|
| `Principal` | Full Principal entity type |
| `PrincipalType` | `'human' \| 'agent' \| 'system'` |
| `PrincipalStatus` | `'active' \| 'suspended' \| 'deactivated'` |

### Database Type

| Export | Description |
|---|---|
| `IdentityDatabase` | Drizzle instance type inferred from the Identity schema — use for typing `db` in consuming apps |

### Error Type

| Export | Description |
|---|---|
| `IdentityError` | Module-scoped error class with a `code: string` property for programmatic handling |

---

## Usage Examples

All use cases return `Result<T, IdentityError>`. Always narrow on `result.success` before accessing `result.value` or `result.error`.

### Registration flow

```typescript
import { makePrincipalRepository, makeCreatePrincipalUseCase } from '@core/identity';

const repo = makePrincipalRepository(db);
const createPrincipal = makeCreatePrincipalUseCase(repo);

const result = await createPrincipal({
  type: 'human',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  metadata: { locale: 'en-GB', avatarUrl: 'https://example.com/ada.jpg' },
});

if (!result.success) {
  switch (result.error.code) {
    case 'EMAIL_ALREADY_EXISTS':
      throw new Error('That email is already registered.');
    case 'VALIDATION_ERROR':
      throw new Error(result.error.message);
    default:
      throw result.error;
  }
}

const principal = result.value;
console.log(principal.id, principal.status); // 'active'
```

### Lookup by ID and email

```typescript
import {
  makePrincipalRepository,
  makeGetPrincipalUseCase,
  makeGetPrincipalByEmailUseCase,
} from '@core/identity';

const repo = makePrincipalRepository(db);
const getPrincipal = makeGetPrincipalUseCase(repo);
const getPrincipalByEmail = makeGetPrincipalByEmailUseCase(repo);

const byId = await getPrincipal({ id: 'clx...' });
if (!byId.success) {
  // byId.error.code === 'PRINCIPAL_NOT_FOUND'
}

const byEmail = await getPrincipalByEmail({ email: 'ada@example.com' });
if (!byEmail.success) {
  // byEmail.error.code === 'PRINCIPAL_NOT_FOUND'
}
```

### Profile update (name, email, metadata)

```typescript
import { makePrincipalRepository, makeUpdatePrincipalUseCase } from '@core/identity';

const repo = makePrincipalRepository(db);
const updatePrincipal = makeUpdatePrincipalUseCase(repo);

// All fields are optional — only provided fields are changed
const result = await updatePrincipal({
  id: principal.id,
  name: 'Ada King',
  email: 'ada.king@example.com',
  metadata: { locale: 'en-US' },
});

if (!result.success) {
  switch (result.error.code) {
    case 'PRINCIPAL_NOT_FOUND':
    case 'PRINCIPAL_ALREADY_DEACTIVATED':
    case 'EMAIL_ALREADY_EXISTS':
    case 'VALIDATION_ERROR':
      // handle accordingly
  }
}
```

### Suspension / kill-switch flow

```typescript
import { makePrincipalRepository, makeSuspendPrincipalUseCase } from '@core/identity';

const repo = makePrincipalRepository(db);
const suspendPrincipal = makeSuspendPrincipalUseCase(repo);

const result = await suspendPrincipal({ id: principal.id });

if (!result.success) {
  // result.error.code is one of:
  //   'PRINCIPAL_NOT_FOUND' | 'PRINCIPAL_ALREADY_DEACTIVATED'
  //   'INVALID_STATUS_TRANSITION' | 'SERVICE_ERROR'
}

// result.value is the updated Principal with status === 'suspended'
```

### Reactivation flow

```typescript
import { makePrincipalRepository, makeReactivatePrincipalUseCase } from '@core/identity';

const repo = makePrincipalRepository(db);
const reactivatePrincipal = makeReactivatePrincipalUseCase(repo);

const result = await reactivatePrincipal({ id: principal.id });

if (!result.success) {
  // 'INVALID_STATUS_TRANSITION' if not currently suspended
  // 'PRINCIPAL_ALREADY_DEACTIVATED' if permanently gone
}

// result.value.status === 'active'
```

### Deactivation (soft delete) flow

```typescript
import { makePrincipalRepository, makeDeactivatePrincipalUseCase } from '@core/identity';

const repo = makePrincipalRepository(db);
const deactivatePrincipal = makeDeactivatePrincipalUseCase(repo);

const result = await deactivatePrincipal({ id: principal.id });

if (!result.success) {
  // result.error.code: 'PRINCIPAL_NOT_FOUND' | 'PRINCIPAL_ALREADY_DEACTIVATED' | 'SERVICE_ERROR'
}

// result.value === undefined (void success)
// The record is preserved with deletedAt stamped — never hard deleted
```

### Checking principal status before auth (orchestrator pattern)

The Application Layer gates authentication on the Principal's status. This prevents suspended or deactivated accounts from proceeding even if their credentials are valid.

The orchestrator sits in your application layer — outside all `@core` modules. It imports from each module independently and links them via Soft Links (plain UUID strings). The pattern below shows the identity-side check:

```typescript
// Application Layer orchestrator — lives in your app, not inside @core/identity

import { makePrincipalRepository, makeGetPrincipalUseCase } from '@core/identity';
// Auth module is imported separately in the application layer (not from within identity)

const principalRepo = makePrincipalRepository(identityDb);
const getPrincipal = makeGetPrincipalUseCase(principalRepo);

async function checkPrincipalStatus(principalId: string) {
  const result = await getPrincipal({ id: principalId });

  if (!result.success) {
    return { allowed: false, reason: 'not_found' as const };
  }

  const { status } = result.value;

  if (status === 'suspended') {
    return { allowed: false, reason: 'suspended' as const };
  }

  if (status === 'deactivated') {
    return { allowed: false, reason: 'deactivated' as const };
  }

  return { allowed: true, principal: result.value };
}
```

### Complete orchestrated registration (Application Layer)

The Application Layer creates a Principal first, then passes the returned ID as a Soft Link to the auth module. Neither module imports the other — the orchestrator holds both.

```typescript
// Application Layer — registration orchestrator
// Imports identity and auth modules independently. They never import each other.

import { makePrincipalRepository, makeCreatePrincipalUseCase } from '@core/identity';

// The auth imports below live here in the APPLICATION layer, not inside @core/identity.
// Shown as comments to illustrate the pattern without violating isolation at the file level:
//   makePrincipalRepository  <-- identity module
//   makeCredentialRepository <-- auth module (imported separately by the orchestrator)

const principalRepo = makePrincipalRepository(identityDb);
const createPrincipal = makeCreatePrincipalUseCase(principalRepo);

async function registerUser(name: string, email: string, password: string) {
  // Step 1: Create the identity anchor
  const principalResult = await createPrincipal({ type: 'human', name, email });
  if (!principalResult.success) throw principalResult.error;

  const principal = principalResult.value;

  // Step 2: The orchestrator passes principal.id as a Soft Link (plain string UUID)
  // to the auth module's createCredential use case. No FK. No cross-module import.
  // credentialResult = await createCredential({ principalId: principal.id, password });

  return principal;
}
```

---

## Error Handling

All use cases return `IdentityError` on failure. Inspect `error.code` for programmatic branching.

| Code | When it occurs |
|---|---|
| `PRINCIPAL_NOT_FOUND` | No active Principal matched the lookup ID or email |
| `EMAIL_ALREADY_EXISTS` | A Principal with that email already exists |
| `VALIDATION_ERROR` | Input failed domain-level validation (name empty, email malformed, metadata over 64 KB) |
| `INVALID_STATUS_TRANSITION` | The requested status change is not permitted by the domain rules (e.g. `deactivated` → anything) |
| `PRINCIPAL_ALREADY_DEACTIVATED` | The Principal exists but has been permanently deactivated (soft-deleted) |
| `SERVICE_ERROR` | Unexpected infrastructure or external service failure |

```typescript
import { IdentityError } from '@core/identity';

const result = await createPrincipal({ type: 'human', name: '', email: 'bad' });

if (!result.success && result.error instanceof IdentityError) {
  switch (result.error.code) {
    case 'VALIDATION_ERROR':
      return { status: 400, body: result.error.message };
    case 'EMAIL_ALREADY_EXISTS':
      return { status: 409, body: 'Email already in use.' };
    case 'SERVICE_ERROR':
      return { status: 503, body: 'Temporary failure. Please retry.' };
  }
}
```

---

## Axiom Compliance

This module adheres to all seven Inviolable Axioms from the Nucleus philosophy.

**Axiom of Isolation** — `@core/identity` imports nothing from any other `@core` module. It depends only on `packages/shared` (for the `Result` type) and its own internal layers. Core modules are blind to each other.

**Axiom of the Orchestrator** — This module never reaches into `@core/auth`, `@core/session`, or any other module. Cross-module workflows (registration, login, permission checks) are orchestrated by the Application Layer, which holds references to each module independently and wires them together via Soft Links (plain UUID strings).

**Axiom of Agnosticism** — There are no "users", "accounts", or "organizations" in this module. The only actor is a **Principal** (`human | agent | system`). Humans and AI agents are mathematically equal at the identity layer.

**Axiom of Data Sovereignty** — Cross-module references use plain text UUID Soft Links. The `id` emitted by this module is just a `string`. Other modules store it in a text column with no database foreign key constraint, so any module can be dropped or replaced without cascading schema changes.

**Axiom of Deferred Deletion** — `makeDeactivatePrincipalUseCase` stamps `deletedAt` synchronously and returns immediately. No data is physically destroyed. A background Reconciliation Engine (Sweeper) is responsible for purging orphaned records across all modules during off-peak hours, ensuring GDPR compliance without blocking the request.

**Axiom of the Zombie Shield** — Every read method in `DrizzlePrincipalRepository` includes `isNull(identityPrincipals.deletedAt)` in the WHERE clause. The sole exception is `findByIdIncludingDeleted`, which intentionally bypasses the shield so deactivate/suspend use cases can distinguish "never existed" from "soft-deleted" — a distinction the normal read path cannot make. This exception is documented in the repository file.

**Axiom of Edge Verification** — This module does not perform per-request authentication. It provides Principal lifecycle management only. Authentication (token verification, credential checking) is handled at the Edge by `@core/auth` and `@core/session`. API routes that call this module trust a statelessly verified Context object from the Edge Middleware rather than querying the database to re-identify the caller.
