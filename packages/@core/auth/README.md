# @core/auth

**Auth — Credential Vault & Verification Engine**

![Status: Stable](https://img.shields.io/badge/status-stable-green.svg)

---

## Overview

The `@core/auth` module is a standalone, reusable authentication system for applications built on the Nucleus architecture. It provides the mechanisms for answering the fundamental authentication question:

> **Is this Principal who they claim to be?**

This module handles credential storage and verification for three authentication mechanisms: passwords, OAuth provider accounts, and API keys. It is part of the Nucleus architecture — a package-driven modular monolith designed for the AI era.

**Key design principle:** This module is agnostic to your business domain. It knows nothing about Users, Organizations, or Roles. All actors are **Principals** — mathematical equals regardless of whether they are humans, AI agents, or system workers. This makes the module composable and reusable across any application.

**Key Features:**
- **Three credential types:** Password (Argon2id), OAuth provider link, and API key
- **Argon2id hashing:** OWASP-recommended parameters, timing-safe comparison
- **O(1) API key lookup:** Key prefix strategy avoids full-table hash scans
- **Soft delete strategy:** Immutable audit trail, no hard deletes
- **Zombie Shield:** All reads filter `deleted_at IS NULL` to prevent ghost data
- **DDD layered architecture:** Clean separation of domain logic, application orchestration, and infrastructure
- **Axiom compliance:** Isolation, Soft Links, Zombie Shield, Deferred Deletion

---

## Architecture

The module is organized into four layers following Domain-Driven Design principles:

```
packages/@core/auth/
├── schema/                        Schema Layer
│   ├── credentials.ts             Drizzle table definition (auth_credentials)
│   ├── enums.ts                   PostgreSQL enum (auth_credential_type)
│   ├── relations.ts               Drizzle relational definitions
│   └── index.ts                   Schema barrel (consumed by drizzle.config.ts)
│
├── domain/                        Domain Layer
│   ├── credential.ts              Credential type, CredentialType, validation functions
│   └── credentialRepository.ts   ICredentialRepository interface (contract only)
│
├── application/                   Application Layer
│   ├── authError.ts               AuthError class with structured error codes
│   ├── createPasswordCredentialUseCase.ts
│   ├── verifyPasswordUseCase.ts
│   ├── changePasswordUseCase.ts
│   ├── linkOAuthProviderUseCase.ts
│   ├── verifyOAuthProviderUseCase.ts
│   ├── createApiKeyUseCase.ts
│   ├── verifyApiKeyUseCase.ts
│   ├── revokeCredentialUseCase.ts
│   ├── revokeAllCredentialsUseCase.ts
│   └── hasActiveCredentialUseCase.ts
│
└── infrastructure/                Infrastructure Layer
    ├── database.ts                AuthDatabase type definition
    ├── hashingService.ts          Argon2id HashingService factory
    └── repositories/
        └── DrizzleCredentialRepository.ts
```

**Axiom compliance:**

| Axiom | Implementation |
|---|---|
| **Isolation** | No imports from other `@core/*` modules. Zero cross-module dependencies. |
| **Soft Links** | `principalId` is a plain `text` column — no foreign key to Identity module. |
| **Zombie Shield** | Every repository read includes `isNull(deletedAt)` filter. |
| **Deferred Deletion** | All deletes are soft (`deletedAt = now()`). No hard deletes exist. |

**Dependency Rule (strictly enforced):**
- Domain layer: zero external dependencies
- Application layer: depends on domain only
- Infrastructure layer: depends on domain + external libraries (Drizzle, Argon2)
- Schema layer: depends on Drizzle ORM only

---

## Quick Start

```ts
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as authSchema from '@/packages/@core/auth/schema';
import {
  makeCredentialRepository,
  makeHashingService,
  makeCreatePasswordCredentialUseCase,
  makeVerifyPasswordUseCase,
} from '@/packages/@core/auth';

// 1. Create database connection
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 2. Create Drizzle database instance with Auth schema
const db = drizzle(pool, { schema: authSchema });

// 3. Create infrastructure instances
const repo = makeCredentialRepository(db);
const hashingService = makeHashingService();

// 4. Wire use cases
const createPassword = makeCreatePasswordCredentialUseCase(repo, hashingService);
const verifyPassword = makeVerifyPasswordUseCase(repo, hashingService);

// 5. Use
const result = await createPassword({
  principalId: 'principal_abc123',
  password: 'MyS3cur3!Pass',
});

if (result.success) {
  console.log('Credential created:', result.value.id);
} else {
  console.error('Error:', result.error.code, result.error.message);
}
```

---

## API Reference

All use cases follow the same pattern: they are created by a factory function that accepts dependencies and returns an async function. All return `Result<T, AuthError>` — they never throw.

### Password Credentials

#### `makeCreatePasswordCredentialUseCase(repo, hashingService)`

Creates a new password credential for a Principal.

| Field | Value |
|---|---|
| **Dependencies** | `ICredentialRepository`, `HashingService` |
| **Input** | `{ principalId: string; password: string }` |
| **Output** | `Result<Credential, AuthError>` |
| **Error codes** | `VALIDATION_ERROR`, `PASSWORD_TOO_WEAK`, `CREDENTIAL_EXISTS`, `SERVICE_ERROR` |

Password strength rules: minimum 8 characters, at least one uppercase, one lowercase, one digit, and one special character. Only one active password credential is allowed per Principal — attempting to create a second returns `CREDENTIAL_EXISTS`.

---

#### `makeVerifyPasswordUseCase(repo, hashingService)`

Verifies a password against the stored Argon2id hash and returns the Principal ID on success.

| Field | Value |
|---|---|
| **Dependencies** | `ICredentialRepository`, `HashingService` |
| **Input** | `{ principalId: string; password: string }` |
| **Output** | `Result<{ principalId: string }, AuthError>` |
| **Error codes** | `CREDENTIAL_NOT_FOUND`, `VERIFICATION_FAILED`, `SERVICE_ERROR` |

On success, updates `lastUsedAt` timestamp. Returns `principalId` as proof of successful verification.

---

#### `makeChangePasswordUseCase(repo, hashingService)`

Changes a Principal's password. Verifies the current password before replacing it. Soft-deletes the old credential and creates a new one to preserve the audit trail.

| Field | Value |
|---|---|
| **Dependencies** | `ICredentialRepository`, `HashingService` |
| **Input** | `{ principalId: string; currentPassword: string; newPassword: string }` |
| **Output** | `Result<Credential, AuthError>` |
| **Error codes** | `CREDENTIAL_NOT_FOUND`, `INVALID_PASSWORD`, `PASSWORD_TOO_WEAK`, `SERVICE_ERROR` |

---

### OAuth Credentials

#### `makeLinkOAuthProviderUseCase(repo, hashingService)`

Links an OAuth provider account to a Principal. Hashes and stores the access token.

| Field | Value |
|---|---|
| **Dependencies** | `ICredentialRepository`, `HashingService` |
| **Input** | `{ principalId: string; provider: string; providerAccountId: string; accessToken: string }` |
| **Output** | `Result<Credential, AuthError>` |
| **Error codes** | `VALIDATION_ERROR`, `PROVIDER_ALREADY_LINKED`, `SERVICE_ERROR` |

Provider name is normalized (trimmed, lowercased). A given `(provider, providerAccountId)` pair can only be linked to one Principal.

---

#### `makeVerifyOAuthProviderUseCase(repo)`

Resolves a Principal from an OAuth provider account. No hash verification is needed — the OAuth provider has already authenticated the user.

| Field | Value |
|---|---|
| **Dependencies** | `ICredentialRepository` |
| **Input** | `{ provider: string; providerAccountId: string }` |
| **Output** | `Result<{ principalId: string }, AuthError>` |
| **Error codes** | `VALIDATION_ERROR`, `CREDENTIAL_NOT_FOUND`, `SERVICE_ERROR` |

On success, updates `lastUsedAt` timestamp and returns the linked `principalId`.

---

### API Key Credentials

#### `makeCreateApiKeyUseCase(repo, hashingService)`

Generates a cryptographically secure API key and stores its hash. The raw key is returned **exactly once** and cannot be recovered.

| Field | Value |
|---|---|
| **Dependencies** | `ICredentialRepository`, `HashingService` |
| **Input** | `{ principalId: string; expiresAt?: Date }` |
| **Output** | `Result<{ credential: Credential; rawKey: string }, AuthError>` |
| **Error codes** | `VALIDATION_ERROR`, `SERVICE_ERROR` |

API key format: `nk_{8-char-prefix}_{56-char-hex}`. The `keyPrefix` is stored in plain text for O(1) bucket lookup during verification. Multiple API keys per Principal are allowed.

---

#### `makeVerifyApiKeyUseCase(repo, hashingService)`

Verifies a raw API key using a two-phase lookup: prefix bucket narrowing followed by Argon2id hash comparison.

| Field | Value |
|---|---|
| **Dependencies** | `ICredentialRepository`, `HashingService` |
| **Input** | `{ rawKey: string }` |
| **Output** | `Result<{ principalId: string }, AuthError>` |
| **Error codes** | `CREDENTIAL_NOT_FOUND`, `EXPIRED_CREDENTIAL`, `VERIFICATION_FAILED`, `SERVICE_ERROR` |

On match, checks expiration (`expiresAt`), updates `lastUsedAt`, and returns the owning `principalId`.

---

### Credential Lifecycle

#### `makeRevokeCredentialUseCase(repo)`

Soft-deletes a single credential by its ID.

| Field | Value |
|---|---|
| **Dependencies** | `ICredentialRepository` |
| **Input** | `{ credentialId: string }` |
| **Output** | `Result<void, AuthError>` |
| **Error codes** | `VALIDATION_ERROR`, `CREDENTIAL_NOT_FOUND`, `SERVICE_ERROR` |

---

#### `makeRevokeAllCredentialsUseCase(repo)`

Soft-deletes ALL active credentials for a Principal. Used when a Principal account is deactivated or deleted.

| Field | Value |
|---|---|
| **Dependencies** | `ICredentialRepository` |
| **Input** | `{ principalId: string }` |
| **Output** | `Result<void, AuthError>` |
| **Error codes** | `VALIDATION_ERROR`, `SERVICE_ERROR` |

Zombie Shield is applied on write: only credentials where `deletedAt IS NULL` are stamped, avoiding duplicate soft-delete timestamps.

---

#### `makeHasActiveCredentialUseCase(repo)`

Checks whether a Principal has at least one active credential, optionally filtered by type.

| Field | Value |
|---|---|
| **Dependencies** | `ICredentialRepository` |
| **Input** | `{ principalId: string; type?: CredentialType }` |
| **Output** | `Result<boolean, AuthError>` |
| **Error codes** | `VALIDATION_ERROR`, `SERVICE_ERROR` |

Useful for onboarding gates, account status checks, and access guards.

---

## Schema Reference

**Table:** `auth_credentials`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `text` | Primary Key, auto-generated (cuid2) | Unique credential identifier |
| `principal_id` | `text` | NOT NULL | Soft link to Identity module principal |
| `type` | `auth_credential_type` | NOT NULL | Enum: `password`, `oauth`, `api_key` |
| `provider` | `text` | Nullable | OAuth provider name (e.g. `github`, `google`) |
| `provider_account_id` | `text` | Nullable | Provider-issued account identifier |
| `secret_hash` | `text` | NOT NULL | Argon2id hash of password, access token, or API key |
| `key_prefix` | `text` | Nullable | First 8 chars of raw API key for O(1) bucket lookup |
| `last_used_at` | `timestamptz` | Nullable | Updated on successful verification |
| `expires_at` | `timestamptz` | Nullable | Expiry timestamp for API keys |
| `deleted_at` | `timestamptz` | Nullable | NULL = active, timestamp = soft-deleted |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL, default `now()`, auto-updated | Last modification timestamp |

**Indexes:**

| Index | Type | Columns | Purpose |
|---|---|---|---|
| `auth_credentials_principal_id_idx` | Standard | `principal_id` | Fast lookup of all credentials for a Principal |
| `auth_credentials_type_idx` | Standard | `type` | Filter credentials by type |
| `auth_credentials_expires_at_idx` | Standard | `expires_at` | Efficient expiry queries for cleanup jobs |
| `auth_credentials_deleted_at_idx` | Standard | `deleted_at` | Support Zombie Shield filtering |
| `auth_credentials_key_prefix_idx` | Standard | `key_prefix` | O(1) bucket lookup for API key verification |
| `auth_credentials_principal_password_unique_active` | Partial Unique | `(principal_id, type)` WHERE `deleted_at IS NULL AND type = 'password'` | One active password per Principal |
| `auth_credentials_principal_provider_unique_active` | Partial Unique | `(principal_id, provider, provider_account_id)` WHERE `deleted_at IS NULL` | One OAuth link per (Principal, provider account) |

---

## Error Codes

All errors are instances of `AuthError` with a `code` string property for programmatic handling.

| Code | Description |
|---|---|
| `CREDENTIAL_EXISTS` | Principal already has an active credential of this type (e.g. attempting to create a second password credential) |
| `CREDENTIAL_NOT_FOUND` | No active credential matched the lookup criteria |
| `INVALID_PASSWORD` | Current password verification failed during a password change operation |
| `PASSWORD_TOO_WEAK` | New password does not meet strength requirements |
| `VERIFICATION_FAILED` | Credential verification failed (wrong password or API key did not match any candidate) |
| `EXPIRED_CREDENTIAL` | API key has passed its `expiresAt` timestamp |
| `PROVIDER_ALREADY_LINKED` | The OAuth provider account is already linked to a Principal |
| `VALIDATION_ERROR` | Input validation failed (empty principalId, empty provider, etc.) |
| `SERVICE_ERROR` | Unexpected internal error (database unreachable, hashing failure, etc.) |

```ts
import { AuthError } from '@/packages/@core/auth';

const result = await verifyPassword({ principalId, password });

if (!result.success) {
  switch (result.error.code) {
    case 'CREDENTIAL_NOT_FOUND':
      // No password set up — prompt user to register
      break;
    case 'VERIFICATION_FAILED':
      // Wrong password — increment failed attempt counter
      break;
    case 'SERVICE_ERROR':
      // Infrastructure failure — return 500
      break;
  }
}
```

---

## Integration Examples

### Registration Flow

The orchestrating layer (e.g. an Identity module use case or an API route) creates the Principal first via the Identity module, then calls Auth to create the credential. Auth and Identity never import each other — they are linked only by the plain-text `principalId`.

```ts
// Orchestrator (API route or higher-level use case)
const identityResult = await createPrincipal({ email });
if (!identityResult.success) return identityResult;

const authResult = await createPassword({
  principalId: identityResult.value.id,
  password: rawPassword,
});
if (!authResult.success) return authResult;

// Both succeeded — user is registered
```

---

### Password Login Flow

```ts
const result = await verifyPassword({ principalId, password });

if (!result.success) {
  // Handle CREDENTIAL_NOT_FOUND or VERIFICATION_FAILED
  return { error: 'Invalid credentials' };
}

// result.value.principalId is the verified identity
// Hand off to Session module to mint a session token
const session = await createSession({ principalId: result.value.principalId });
```

---

### OAuth Login Flow

```ts
// After OAuth provider redirects back with code, exchange for tokens:
const { provider, providerAccountId, accessToken } = await exchangeOAuthCode(code);

// Try to resolve existing linked Principal
const resolveResult = await verifyOAuthProvider({ provider, providerAccountId });

if (resolveResult.success) {
  // Existing Principal — mint session
  const session = await createSession({ principalId: resolveResult.value.principalId });
} else if (resolveResult.error.code === 'CREDENTIAL_NOT_FOUND') {
  // No linked Principal — create a new one, then link
  const principalResult = await createPrincipal({ email });
  await linkOAuthProvider({
    principalId: principalResult.value.id,
    provider,
    providerAccountId,
    accessToken,
  });
  const session = await createSession({ principalId: principalResult.value.id });
}
```

---

### API Key Authentication Flow

```ts
// Creating an API key (e.g. on dashboard request):
const createResult = await createApiKey({
  principalId: 'principal_abc123',
  expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
});

if (createResult.success) {
  // Show rawKey to user ONCE — it cannot be recovered later
  const { rawKey, credential } = createResult.value;
  return { apiKey: rawKey, keyId: credential.id };
}

// Verifying an incoming API key (e.g. in API route middleware):
const verifyResult = await verifyApiKey({ rawKey: request.headers['x-api-key'] });

if (!verifyResult.success) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

// verifyResult.value.principalId is the verified identity
```

---

### Password Change Flow

```ts
const result = await changePassword({
  principalId: authenticatedPrincipalId,
  currentPassword,
  newPassword,
});

if (!result.success) {
  if (result.error.code === 'INVALID_PASSWORD') {
    return { error: 'Current password is incorrect' };
  }
  if (result.error.code === 'PASSWORD_TOO_WEAK') {
    return { error: result.error.message };
  }
}

// Old credential is soft-deleted, new one is active
```

---

### Credential Revocation on Principal Deactivation

```ts
// When Identity module deactivates a Principal, orchestrator calls:
const result = await revokeAllCredentials({ principalId });

if (!result.success) {
  // Log SERVICE_ERROR — infrastructure failure during cleanup
  logger.error('Failed to revoke credentials', { principalId, code: result.error.code });
}

// All active credentials are now soft-deleted
// The Principal can no longer authenticate via any mechanism
```

---

### API Key Rotation

```ts
// Create new key first
const newKeyResult = await createApiKey({ principalId });
if (!newKeyResult.success) return newKeyResult;

// Revoke the old key
const revokeResult = await revokeCredential({ credentialId: oldKeyId });
if (!revokeResult.success) {
  // Log — the new key was created but old key revocation failed
  logger.warn('Old API key revocation failed', { oldKeyId, code: revokeResult.error.code });
}

// Return new raw key to caller
return { rawKey: newKeyResult.value.rawKey };
```

---

## Security

**Argon2id hashing (OWASP-recommended parameters):**

| Parameter | Value | Rationale |
|---|---|---|
| `memoryCost` | 19456 KiB (19 MiB) | Resists GPU-based brute-force attacks |
| `timeCost` | 2 iterations | Balances security and server latency |
| `parallelism` | 1 lane | Single-threaded, safe for server environments |
| `outputLen` | 32 bytes | 256-bit hash output |

**No plaintext secrets stored.** Passwords, API keys, and OAuth access tokens are always hashed before persistence. The raw value is never written to the database.

**API keys returned exactly once.** The `rawKey` is returned by `makeCreateApiKeyUseCase` at creation time only. It is not stored anywhere — only its Argon2id hash is persisted. If lost, the key must be rotated.

**O(1) lookup via key prefix.** The first 8 characters of the raw API key are stored in plain text as `keyPrefix`. During verification, the repository fetches only the small bucket of credentials sharing that prefix before running Argon2id comparison. This avoids full-table hash scans without exposing the full secret.

**Timing-safe comparison.** All hash verification is delegated to `@node-rs/argon2`'s `verify` function, which performs constant-time comparison to prevent timing-based attacks.

**Soft deletes preserve audit trail.** No credential is ever hard-deleted. The `deletedAt` timestamp records exactly when a credential was revoked, providing a complete immutable audit log for compliance and incident investigation.

**Zombie Shield on all reads.** Every repository query that reads credentials includes `isNull(deletedAt)` in its `WHERE` clause. Soft-deleted credentials are invisible to the application layer without additional filtering logic.
