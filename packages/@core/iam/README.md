# @core/iam

**IAM (Identity & Access Management) — Core Authorization Module**

![Status: Stable](https://img.shields.io/badge/status-stable-green.svg)

---

## Overview

The `@core/iam` module is a standalone, reusable authorization system for multi-tenant applications. It provides the **mechanisms** for answering the fundamental authorization question:

> **Can Principal X perform Action Y in Tenant Z?**

This module is part of the Nucleus architecture — a package-driven modular monolith designed for the AI era. It handles authorization (what you can do), not authentication (who you are). It's agnostic to your business domain and can be integrated into any application that needs fine-grained, tenant-aware access control.

Unlike traditional Role-Based Access Control (RBAC), this module uses an **agnostic terminology** that treats all actors (humans, AI agents, system workers) as mathematical equals. It employs **Policies** (reusable permission bundles) and **Entitlements** (assignments of policies to principals in specific contexts) to provide flexible, scalable authorization.

**Key Features:**
- **Tenant-aware permissions:** Authorization scoped to platform-level or tenant-specific contexts
- **Flexible policy system:** Named bundles of actions that can be assigned, updated, and revoked dynamically
- **CASL integration:** Runtime permission evaluation using the battle-tested CASL library
- **Soft links architecture:** Cross-module references without hard foreign keys for maximum modularity
- **Soft delete strategy:** Immutable audit trail with asynchronous cleanup
- **DDD layered architecture:** Clean separation of domain logic, application orchestration, and infrastructure

---

## Architecture

This module follows **Domain-Driven Design (DDD)** principles with a strict three-layer architecture:

```
@core/iam/
├── schema/                      # Database schema (Drizzle, TypeScript-native)
│   ├── enums.ts                 # PostgreSQL enum types (PolicyScope)
│   ├── policies.ts              # Policies table definition
│   ├── entitlements.ts          # Entitlements table definition
│   ├── relations.ts             # ORM-level relations (one-to-many)
│   └── index.ts                 # Schema barrel export
│
├── domain/                      # Pure business logic (NO dependencies)
│   ├── action.ts                # Action string validation (resource:action:scope)
│   ├── policy.ts                # Policy entity and validation
│   ├── entitlement.ts           # Entitlement entity and validation
│   ├── policyRepository.ts      # Policy persistence contract (interface)
│   └── entitlementRepository.ts # Entitlement persistence contract (interface)
│
├── application/                 # Use case orchestration
│   ├── accessError.ts           # Custom error type with codes
│   ├── createPolicyUseCase.ts   # Create new policy
│   ├── updatePolicyActionsUseCase.ts # Modify policy actions
│   ├── grantEntitlementUseCase.ts    # Grant policy to principal
│   ├── revokeEntitlementUseCase.ts   # Revoke policy from principal
│   ├── resolvePrincipalPermissionsUseCase.ts # Get all permissions
│   ├── evaluateAccessUseCase.ts      # Check single permission
│   └── buildPrincipalAbilityUseCase.ts # Build reusable CASL ability
│
├── infrastructure/              # Technical implementations
│   ├── database.ts              # IAMDatabase type definition
│   ├── CASLAbilityFactory.ts    # CASL ability builder
│   └── repositories/
│       ├── DrizzlePolicyRepository.ts      # Drizzle policy implementation
│       └── DrizzleEntitlementRepository.ts # Drizzle entitlement implementation
│
└── index.ts                     # Module public API (barrel export)
```

### Layer Responsibilities

**Domain Layer (The Heart)**
- Contains pure business logic and validation rules
- Defines data structures (TypeScript types)
- Defines repository interfaces (contracts)
- Zero external dependencies
- Zero side effects (no database, no API calls)
- Returns `Result<T, E>` types instead of throwing exceptions

**Application Layer (The Orchestrator)**
- Orchestrates use cases by coordinating domain + infrastructure
- Handles transaction boundaries
- Manages technical concerns (ID generation, timestamps)
- Uses higher-order functions for dependency injection
- Contains NO business logic (delegates to domain)

**Infrastructure Layer (The Tools)**
- Implements repository interfaces using concrete technologies (Drizzle)
- Provides CASL ability factory for runtime evaluation
- Contains all framework-specific and database-specific code
- Never accessed directly by consumers (only via application layer)

---

## Concepts

### Principal

**Definition:** Any actor capable of performing actions in the system.

A Principal is a universal abstraction that represents:
- **Human users** (authenticated via password, OAuth, etc.)
- **AI agents** (authenticated via API keys, mTLS)
- **System workers** (background jobs, cron tasks)

Principals are **externally managed** by the Identity module (`@core/identity`). The IAM module only stores the `principalId` as a **soft link** (plain string UUID) — no foreign key constraint.

**Example:**
```typescript
const principalId = "cuid_abc123"; // Reference to a Principal in Identity module
```

### Tenant

**Definition:** An isolated data boundary representing an organizational scope.

Tenants provide multi-tenancy by partitioning data and permissions:
- **Examples:** An organization, workspace, team, or account
- **Platform scope:** When `tenantId` is `null`, permissions apply platform-wide
- **Tenant scope:** When `tenantId` is set, permissions apply only within that tenant

Tenants are **externally managed** by the Tenancy module (`@core/tenancy`). The IAM module stores `tenantId` as a **soft link** — no foreign key constraint.

**Example:**
```typescript
const tenantId = "cuid_tenant_xyz"; // Reference to a Tenant in Tenancy module
const platformScope = null;         // NULL means platform-wide
```

### Policy

**Definition:** A named, reusable bundle of actions (the agnostic equivalent of a "Role").

Policies define **WHAT** can be done. They are assigned to Principals via Entitlements.

**Structure:**
```typescript
type Policy = {
  id: string;                    // Unique identifier
  name: string;                  // Human-readable name (e.g., "tenant_admin")
  scope: 'PLATFORM' | 'TENANT';  // Where this policy applies
  actions: string[];             // Array of action strings
  description?: string;          // Optional explanation
  deletedAt?: Date | null;       // Soft delete timestamp
  createdAt: Date;
  updatedAt: Date;
};
```

**Policy Scope:**
- `PLATFORM`: Policy applies regardless of tenant context (e.g., "platform_admin")
- `TENANT`: Policy applies only within a specific tenant (e.g., "campaign_manager")

**Business Rules:**
- Policy names must be unique among active (non-deleted) policies
- PLATFORM-scoped policies cannot have a `tenantId`
- TENANT-scoped policies must have a `tenantId`
- Policies are additive — a Principal's effective permissions are the **union** of all their active entitlements

**Example:**
```typescript
const platformAdminPolicy: Policy = {
  id: "cuid_policy_1",
  name: "platform_admin",
  scope: "PLATFORM",
  actions: [
    "users:create:all",
    "users:read:all",
    "users:update:all",
    "users:delete:all",
    "tenants:create:all",
    "tenants:delete:all"
  ],
  description: "Full platform administrative access",
  createdAt: new Date(),
  updatedAt: new Date()
};

const campaignManagerPolicy: Policy = {
  id: "cuid_policy_2",
  name: "campaign_manager",
  scope: "TENANT",
  actions: [
    "campaigns:create:team",
    "campaigns:read:team",
    "campaigns:update:team",
    "campaigns:delete:own",
    "creators:invite:team"
  ],
  description: "Manage campaigns within tenant",
  createdAt: new Date(),
  updatedAt: new Date()
};
```

### Entitlement

**Definition:** The assignment of a Policy to a Principal within an optional Tenant context.

Entitlements answer: **"Principal X has Policy Y in Tenant Z."**

**Structure:**
```typescript
type Entitlement = {
  id: string;                     // Unique identifier
  principalId: string;            // Soft link to Identity module
  tenantId?: string | null;       // Soft link to Tenancy module (NULL = PLATFORM)
  policyId: string;               // Hard FK to Policy (intra-module relation)
  grantedByPrincipalId: string;   // Soft link to Identity (for audit trail)
  policy: Policy;                 // Nested policy data (from Drizzle relational query)
  deletedAt?: Date | null;        // Soft delete timestamp
  createdAt: Date;
  updatedAt: Date;
};
```

**Business Rules:**
- PLATFORM-scoped policies can only be granted with `tenantId = null`
- TENANT-scoped policies must be granted with a specific `tenantId`
- No duplicate entitlements (same principal + policy + tenant context)
- Soft-deleted policies do not resolve (zombie shield)

**Example:**
```typescript
const entitlement: Entitlement = {
  id: "cuid_ent_1",
  principalId: "cuid_user_alice",
  tenantId: "cuid_tenant_acme",
  policyId: "cuid_policy_campaign_manager",
  grantedByPrincipalId: "cuid_user_bob", // Bob granted this to Alice
  policy: campaignManagerPolicy,
  createdAt: new Date(),
  updatedAt: new Date()
};
```

### Action

**Definition:** A permission string in the format `resource:action:scope`.

Actions define the specific operations a Principal can perform.

**Format:**
```
resource:action:scope
```

**Components:**

1. **Resource** (application-defined): The type of entity being accessed
   - Examples: `campaigns`, `users`, `creators`, `deliverables`, `organizations`

2. **Action** (standard verbs): The operation being performed
   - Standard actions: `create`, `read`, `update`, `delete`, `assign`, `manage`
   - `manage` is a CASL keyword meaning "any action"

3. **Scope** (access boundary): The data boundary for the action
   - `all`: Unrestricted access to all resources of this type
   - `team`: Access scoped to resources within the tenant
   - `own`: Access scoped to resources owned by the principal

**Examples:**
```typescript
"campaigns:create:team"     // Create campaigns within tenant
"campaigns:read:all"        // Read all campaigns (no restrictions)
"campaigns:update:own"      // Update only own campaigns
"campaigns:delete:team"     // Delete campaigns within tenant
"users:manage:all"          // Any action on all users
"deliverables:assign:team"  // Assign deliverables within tenant
```

**Validation Rules:**
- Must contain exactly 3 parts separated by colons
- Scope must be one of: `own`, `team`, `all`
- No empty parts allowed

### Scope

**Definition:** The data boundary for an action.

Scopes determine **which resources** a Principal can access when performing an action.

| Scope | Meaning | CASL Condition | Example |
|-------|---------|----------------|---------|
| `all` | Unrestricted access to all resources | None | Platform admin can read all campaigns |
| `team` | Access scoped to tenant resources | `{ tenantId: "..." }` | Campaign manager can update campaigns in their tenant |
| `own` | Access scoped to owned resources | `{ principalId: "..." }` | User can delete only their own drafts |

**How Scopes Map to CASL:**

```typescript
// "campaigns:read:all" → CASL rule
ability.can('read', 'campaigns'); // No conditions

// "campaigns:update:team" → CASL rule (for tenant "acme")
ability.can('update', 'campaigns', { tenantId: 'cuid_tenant_acme' });

// "campaigns:delete:own" → CASL rule (for principal "alice")
ability.can('delete', 'campaigns', { principalId: 'cuid_user_alice' });
```

---

## Database Schema

The IAM module **owns its schema** using Drizzle ORM. The schema is defined in TypeScript code within the module, not in an external DSL file. This approach provides type safety, modular ownership, and eliminates the need for raw SQL hacks.

### Schema Organization

```
schema/
├── enums.ts         # PostgreSQL enum types
├── policies.ts      # Policies table definition
├── entitlements.ts  # Entitlements table definition
├── relations.ts     # ORM-level relations
└── index.ts         # Barrel export
```

### Policy Scope Enum

```typescript
// schema/enums.ts
import { pgEnum } from 'drizzle-orm/pg-core';

export const policyScope = pgEnum('policy_scope', ['PLATFORM', 'TENANT']);
```

### Policy Table

```typescript
// schema/policies.ts
import { pgTable, text, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';
import { isNull } from 'drizzle-orm';
import { policyScope } from './enums';

export const policies = pgTable(
  'policies',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text('name').notNull(),
    scope: policyScope('scope').notNull(),
    actions: jsonb('actions').$type<string[]>().notNull(),
    description: text('description'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    nameIdx: index('policies_name_idx').on(table.name),
    scopeIdx: index('policies_scope_idx').on(table.scope),
    deletedAtIdx: index('policies_deleted_at_idx').on(table.deletedAt),
    // Partial unique index (Drizzle native support!)
    nameUniqueActive: uniqueIndex('policies_name_unique_active')
      .on(table.name)
      .where(isNull(table.deletedAt)),
  })
);
```

**Key Points:**
- `actions`: Stored as `jsonb` with TypeScript type `string[]`
- `scope`: PostgreSQL enum type for PLATFORM/TENANT
- `deletedAt`: Soft delete timestamp (never hard-delete)
- **Partial unique index handled natively by Drizzle** (no raw SQL needed!)

### Entitlement Table

```typescript
// schema/entitlements.ts
import { pgTable, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';
import { isNull } from 'drizzle-orm';

export const entitlements = pgTable(
  'entitlements',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    principalId: text('principal_id').notNull(), // SOFT LINK - NO FK
    tenantId: text('tenant_id'),                 // SOFT LINK - NO FK. NULL = PLATFORM
    policyId: text('policy_id')
      .notNull()
      .references(() => policies.id, { onDelete: 'restrict' }), // Intra-module FK
    grantedByPrincipalId: text('granted_by_principal_id').notNull(), // SOFT LINK - NO FK
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    principalTenantPolicyIdx: index('entitlements_principal_tenant_policy_idx').on(
      table.principalId,
      table.tenantId,
      table.policyId
    ),
    principalIdIdx: index('entitlements_principal_id_idx').on(table.principalId),
    tenantIdIdx: index('entitlements_tenant_id_idx').on(table.tenantId),
    policyIdIdx: index('entitlements_policy_id_idx').on(table.policyId),
    grantedByIdx: index('entitlements_granted_by_idx').on(table.grantedByPrincipalId),
    deletedAtIdx: index('entitlements_deleted_at_idx').on(table.deletedAt),
    // Partial unique index (Drizzle native support!)
    principalTenantPolicyUniqueActive: uniqueIndex(
      'entitlements_principal_tenant_policy_unique_active'
    )
      .on(table.principalId, table.tenantId, table.policyId)
      .where(isNull(table.deletedAt)),
  })
);
```

**Key Points:**
- `principalId`: **Soft link** to `@core/identity` (no FK constraint)
- `tenantId`: **Soft link** to `@core/tenancy` (no FK constraint)
- `grantedByPrincipalId`: **Soft link** for audit trail (who granted this permission)
- `policyId`: **Hard FK** to Policy (allowed within same module)
- `deletedAt`: Soft delete timestamp
- **Partial unique index handled natively by Drizzle** (no raw SQL needed!)

### Relations

```typescript
// schema/relations.ts
import { relations } from 'drizzle-orm';
import { policies, entitlements } from './';

export const policiesRelations = relations(policies, ({ many }) => ({
  entitlements: many(entitlements),
}));

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
  policy: one(policies, {
    fields: [entitlements.policyId],
    references: [policies.id],
  }),
}));
```

### Soft Links vs Intra-Module Foreign Keys

**Soft Links (Cross-Module):**
- `principalId`, `tenantId`, `grantedByPrincipalId` are **plain string columns**
- NO database foreign key constraints
- Allows modules to remain isolated and independently deployable
- Prevents database-level coupling between modules

**Hard Foreign Keys (Intra-Module):**
- `policyId` references `policies.id` within the same module
- Uses `.references()` with `onDelete: 'restrict'`
- Allowed because both tables live in the same bounded context

### Zombie Shield (Soft Delete Protection)

All repository queries MUST filter out soft-deleted records:

```typescript
// Drizzle zombie shield
where: and(
  eq(entitlements.principalId, principalId),
  isNull(entitlements.deletedAt),
  isNull(entitlements.policy.deletedAt) // Check nested via relational query
)

// Double zombie shield (filter in application code)
const activeResults = results.filter((r) => r.policy.deletedAt === null);
```

### Partial Unique Indexes

**Drizzle handles partial unique indexes natively!** No raw SQL migrations needed.

The `where(isNull(table.deletedAt))` clause on unique indexes ensures:
1. Soft-deleted policies don't block reuse of policy names
2. Soft-deleted entitlements don't block re-granting the same policy
3. Active entitlements enforce uniqueness per context

This is a major advantage over Prisma, which requires manual SQL scripts for this functionality.

---

## Installation & Setup

### Prerequisites

- **Node.js** 18+ with TypeScript
- **PostgreSQL** 12+ (or compatible database)
- **Drizzle ORM** - Schema-as-code TypeScript ORM
- **@casl/ability** 6.x

### Step 1: Install Dependencies

```bash
# Install runtime dependencies
npm install drizzle-orm pg @casl/ability @paralleldrive/cuid2

# Install dev dependencies
npm install -D drizzle-kit @types/pg
```

### Step 2: Add Module to Your Application

Copy the `@core/iam` module into your packages directory:

```
your-app/
├── packages/
│   └── @core/
│       └── iam/          # This module
│           ├── schema/   # Database schema (TypeScript)
│           ├── domain/
│           ├── application/
│           └── infrastructure/
```

### Step 3: Configure Drizzle

Create a `drizzle.config.ts` at your project root:

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: ['./packages/@core/iam/schema/index.ts'],
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
```

### Step 4: Create Database Instance

Set up your Drizzle database client:

```typescript
// app/lib/db.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as iamSchema from '@core/iam/schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema: iamSchema });

export type IAMDatabase = typeof db;
```

### Step 5: Run Database Migration

```bash
# Generate migration files from schema
npx drizzle-kit generate

# Apply migrations to database
npx drizzle-kit migrate
```

**Note:** Unlike Prisma, Drizzle handles partial unique indexes natively in the schema definition. No manual SQL scripts needed!

### Step 6: Configure Shared Result Type

Ensure you have the `Result` type in your shared utilities:

```typescript
// packages/shared/lib/result.ts
export type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };
```

### Step 7: Verify Installation

```bash
# TypeScript compilation check
npx tsc --noEmit

# Verify migration status
npx drizzle-kit check
```

---

## API Reference

All use cases follow the **higher-order function pattern** for dependency injection. Each factory function returns the actual use case function.

### 1. makeCreatePolicyUseCase

**Purpose:** Create a new policy with validated actions.

**Factory Signature:**
```typescript
const makeCreatePolicyUseCase = (
  policyRepository: IPolicyRepository
) => (data: CreatePolicyInput) => Promise<Result<Policy, AccessError>>
```

**Input Type:**
```typescript
type CreatePolicyInput = {
  name: string;           // Policy name (unique among active policies)
  scope: PolicyScope;     // 'PLATFORM' or 'TENANT'
  actions: string[];      // Array of action strings (e.g., ["campaigns:create:team"])
  description?: string;   // Optional human-readable description
}
```

**Output Type:**
```typescript
Result<Policy, AccessError>
// Success: { success: true, value: Policy }
// Failure: { success: false, error: AccessError }
```

**Error Codes:**
- `POLICY_EXISTS`: Policy with this name already exists
- `VALIDATION_ERROR`: Invalid policy name, empty actions, or invalid action format
- `SERVICE_ERROR`: Unexpected database or system error

**Example:**
```typescript
import { makeCreatePolicyUseCase, makePolicyRepository } from '@core/iam';
import { db } from '@/lib/db'; // Your Drizzle database instance

// Instantiate repository with db instance
const policyRepository = makePolicyRepository(db);

// Instantiate use case with repository
const createPolicy = makeCreatePolicyUseCase(policyRepository);

// Execute use case
const result = await createPolicy({
  name: "campaign_manager",
  scope: "TENANT",
  actions: [
    "campaigns:create:team",
    "campaigns:read:team",
    "campaigns:update:team",
    "campaigns:delete:own"
  ],
  description: "Manage campaigns within tenant"
});

if (!result.success) {
  console.error(`Error: ${result.error.code} - ${result.error.message}`);
  return;
}

console.log(`Policy created: ${result.value.id}`);
```

---

### 2. makeUpdatePolicyActionsUseCase

**Purpose:** Update the actions array of an existing policy.

**Factory Signature:**
```typescript
const makeUpdatePolicyActionsUseCase = (
  policyRepository: IPolicyRepository
) => (data: UpdatePolicyActionsInput) => Promise<Result<void, AccessError>>
```

**Input Type:**
```typescript
type UpdatePolicyActionsInput = {
  policyId: string;      // ID of policy to update
  actions: string[];     // New array of action strings (replaces existing)
}
```

**Output Type:**
```typescript
Result<void, AccessError>
// Success: { success: true, value: undefined }
// Failure: { success: false, error: AccessError }
```

**Error Codes:**
- `POLICY_NOT_FOUND`: Policy does not exist or is soft-deleted
- `INVALID_INPUT`: Actions array is empty
- `VALIDATION_ERROR`: One or more actions have invalid format
- `SERVICE_ERROR`: Unexpected database or system error

**Example:**
```typescript
import { makeUpdatePolicyActionsUseCase, makePolicyRepository } from '@core/iam';
import { db } from '@/lib/db';

const policyRepository = makePolicyRepository(db);
const updatePolicyActions = makeUpdatePolicyActionsUseCase(policyRepository);

const result = await updatePolicyActions({
  policyId: "cuid_policy_123",
  actions: [
    "campaigns:create:team",
    "campaigns:read:team",
    "campaigns:update:team",
    "campaigns:delete:team", // Added delete permission
    "creators:invite:team"   // Added new permission
  ]
});

if (!result.success) {
  console.error(`Failed to update policy: ${result.error.message}`);
}
```

---

### 3. makeGrantEntitlementUseCase

**Purpose:** Grant a policy to a principal in a specific tenant context.

**Factory Signature:**
```typescript
const makeGrantEntitlementUseCase = (
  entitlementRepository: IEntitlementRepository,
  policyRepository: IPolicyRepository
) => (data: GrantEntitlementInput) => Promise<Result<Entitlement, AccessError>>
```

**Input Type:**
```typescript
type GrantEntitlementInput = {
  principalId: string;           // Principal receiving the policy
  policyId: string;              // Policy to grant
  tenantId?: string | null;      // Tenant context (null = PLATFORM)
  grantedByPrincipalId: string;  // Principal granting this permission (for audit)
}
```

**Output Type:**
```typescript
Result<Entitlement, AccessError>
// Success: { success: true, value: Entitlement }
// Failure: { success: false, error: AccessError }
```

**Error Codes:**
- `POLICY_NOT_FOUND`: Policy does not exist or is soft-deleted
- `GRANT_DENIED`: Policy scope mismatch or duplicate entitlement
- `SERVICE_ERROR`: Unexpected database or system error

**Business Rules Enforced:**
- PLATFORM policies require `tenantId = null`
- TENANT policies require `tenantId` to be specified
- Cannot grant the same policy twice in the same context

**Example:**
```typescript
import { makeGrantEntitlementUseCase, makePolicyRepository, makeEntitlementRepository } from '@core/iam';
import { db } from '@/lib/db';

const policyRepository = makePolicyRepository(db);
const entitlementRepository = makeEntitlementRepository(db);

const grantEntitlement = makeGrantEntitlementUseCase(
  entitlementRepository,
  policyRepository
);

// Grant tenant-scoped policy
const result = await grantEntitlement({
  principalId: "cuid_user_alice",
  policyId: "cuid_policy_campaign_manager",
  tenantId: "cuid_tenant_acme",
  grantedByPrincipalId: "cuid_user_admin"
});

if (!result.success) {
  if (result.error.code === 'GRANT_DENIED') {
    console.log('Duplicate entitlement or scope mismatch');
  }
  return;
}

console.log(`Entitlement granted: ${result.value.id}`);
```

---

### 4. makeRevokeEntitlementUseCase

**Purpose:** Revoke a policy from a principal in a specific context.

**Factory Signature:**
```typescript
const makeRevokeEntitlementUseCase = (
  entitlementRepository: IEntitlementRepository,
  policyRepository: IPolicyRepository
) => (data: RevokeEntitlementInput) => Promise<Result<void, AccessError>>
```

**Input Type:**
```typescript
type RevokeEntitlementInput = {
  principalId: string;       // Principal to revoke from
  policyId: string;          // Policy to revoke
  tenantId?: string | null;  // Tenant context (null = PLATFORM)
}
```

**Output Type:**
```typescript
Result<void, AccessError>
// Success: { success: true, value: undefined }
// Failure: { success: false, error: AccessError }
```

**Error Codes:**
- `POLICY_NOT_FOUND`: Policy does not exist or is soft-deleted
- `ENTITLEMENT_NOT_FOUND`: Principal does not have this policy in this context
- `SERVICE_ERROR`: Unexpected database or system error

**Note:** This performs a **soft delete** (sets `deletedAt` timestamp), not a hard delete.

**Example:**
```typescript
import { makeRevokeEntitlementUseCase, makePolicyRepository, makeEntitlementRepository } from '@core/iam';
import { db } from '@/lib/db';

const policyRepository = makePolicyRepository(db);
const entitlementRepository = makeEntitlementRepository(db);

const revokeEntitlement = makeRevokeEntitlementUseCase(
  entitlementRepository,
  policyRepository
);

const result = await revokeEntitlement({
  principalId: "cuid_user_alice",
  policyId: "cuid_policy_campaign_manager",
  tenantId: "cuid_tenant_acme"
});

if (!result.success) {
  if (result.error.code === 'ENTITLEMENT_NOT_FOUND') {
    console.log('Principal does not have this policy');
  }
}
```

---

### 5. makeResolvePrincipalPermissionsUseCase

**Purpose:** Get all effective permissions for a principal (all actions from all entitlements).

**Factory Signature:**
```typescript
const makeResolvePrincipalPermissionsUseCase = (
  entitlementRepository: IEntitlementRepository
) => (data: ResolvePrincipalPermissionsInput) => Promise<Result<PrincipalPermissionsResult[], AccessError>>
```

**Input Type:**
```typescript
type ResolvePrincipalPermissionsInput = {
  principalId: string;       // Principal to resolve permissions for
  tenantId?: string | null;  // Optional: filter to specific tenant (undefined = all contexts)
}
```

**Output Type:**
```typescript
type PrincipalPermissionsResult = {
  principalId: string;
  tenantId?: string | null;  // NULL = PLATFORM context
  actions: string[];         // Deduplicated flat list of action strings
}

Result<PrincipalPermissionsResult[], AccessError>
// Success: { success: true, value: PrincipalPermissionsResult[] }
// Failure: { success: false, error: AccessError }
```

**Error Codes:**
- `CONTEXT_NOT_FOUND`: No entitlements found for this principal/context
- `SERVICE_ERROR`: Unexpected database or system error

**Behavior:**
- If `tenantId` is **undefined**: Returns permissions grouped by all contexts (platform + all tenants)
- If `tenantId` is **specified**: Returns permissions for that tenant only
- Actions are deduplicated within each context

**Example:**
```typescript
import { makeResolvePrincipalPermissionsUseCase, makeEntitlementRepository } from '@core/iam';
import { db } from '@/lib/db';

const entitlementRepository = makeEntitlementRepository(db);
const resolvePermissions = makeResolvePrincipalPermissionsUseCase(entitlementRepository);

// Get permissions for specific tenant
const result = await resolvePermissions({
  principalId: "cuid_user_alice",
  tenantId: "cuid_tenant_acme"
});

if (result.success) {
  result.value.forEach(context => {
    console.log(`Context: ${context.tenantId || 'PLATFORM'}`);
    console.log(`Actions: ${context.actions.join(', ')}`);
  });
}

// Get permissions across all contexts
const allContexts = await resolvePermissions({
  principalId: "cuid_user_alice"
  // tenantId omitted = all contexts
});

if (allContexts.success) {
  console.log(`Principal has ${allContexts.value.length} context(s)`);
}
```

---

### 6. makeEvaluateAccessUseCase

**Purpose:** Check if a principal can perform a specific action (single permission check).

**Factory Signature:**
```typescript
const makeEvaluateAccessUseCase = (
  entitlementRepository: IEntitlementRepository
) => (data: EvaluateAccessInput) => Promise<Result<EvaluateAccessResult, AccessError>>
```

**Input Type:**
```typescript
type EvaluateAccessInput = {
  principalId: string;       // Principal to check
  action: string;            // Action string (e.g., "campaigns:update:team")
  tenantId?: string | null;  // Optional tenant context
  resource?: any;            // Optional resource attributes for CASL condition matching
}
```

**Output Type:**
```typescript
type EvaluateAccessResult = {
  allowed: boolean;          // true if permission granted, false otherwise
  principalId: string;
  action: string;
  tenantId?: string | null;
}

Result<EvaluateAccessResult, AccessError>
// Success: { success: true, value: EvaluateAccessResult }
// Failure: { success: false, error: AccessError }
```

**Error Codes:**
- `INVALID_ACTION`: Action string has invalid format
- `SERVICE_ERROR`: Unexpected database or system error

**Important:** This use case always returns `success: true` with `allowed: false` for denied permissions. It only returns `success: false` for system errors.

**Example:**
```typescript
import { makeEvaluateAccessUseCase, makeEntitlementRepository } from '@core/iam';
import { db } from '@/lib/db';

const entitlementRepository = makeEntitlementRepository(db);
const evaluateAccess = makeEvaluateAccessUseCase(entitlementRepository);

// Check permission without resource
const result = await evaluateAccess({
  principalId: "cuid_user_alice",
  action: "campaigns:create:team",
  tenantId: "cuid_tenant_acme"
});

if (result.success && result.value.allowed) {
  console.log('Permission granted');
} else {
  console.log('Permission denied');
}

// Check permission with resource conditions (for 'own' scope)
const campaign = {
  id: "campaign_123",
  principalId: "cuid_user_alice",  // Alice owns this campaign
  tenantId: "cuid_tenant_acme"
};

const updateResult = await evaluateAccess({
  principalId: "cuid_user_alice",
  action: "campaigns:update:own",  // Check if Alice can update her own campaigns
  tenantId: "cuid_tenant_acme",
  resource: campaign  // CASL will check if campaign.principalId matches
});
```

---

### 7. makeBuildPrincipalAbilityUseCase

**Purpose:** Build a reusable CASL ability object for multiple permission checks.

**Factory Signature:**
```typescript
const makeBuildPrincipalAbilityUseCase = (
  entitlementRepository: IEntitlementRepository
) => (data: BuildPrincipalAbilityInput) => Promise<Result<AppAbility, AccessError>>
```

**Input Type:**
```typescript
type BuildPrincipalAbilityInput = {
  principalId: string;       // Principal to build ability for
  tenantId?: string | null;  // Optional: filter to specific tenant + platform
}
```

**Output Type:**
```typescript
type AppAbility = ReturnType<typeof createMongoAbility>;

Result<AppAbility, AccessError>
// Success: { success: true, value: AppAbility }
// Failure: { success: false, error: AccessError }
```

**Error Codes:**
- `NO_ENTITLEMENTS`: Principal has no entitlements
- `CONTEXT_NOT_FOUND`: Principal has no entitlements in specified context
- `SERVICE_ERROR`: Unexpected database or system error

**When to Use:**
- **API middleware:** Build once per request, use for all route checks
- **Authorization guards:** Build once, check multiple resources
- **UI permission display:** Build once, show/hide many UI elements

**Behavior:**
- If `tenantId` is **undefined**: Returns ability with ALL contexts (platform + all tenants)
- If `tenantId` is **specified**: Returns ability for that tenant + platform entitlements
- Platform entitlements are ALWAYS included (they apply everywhere)

**Example:**
```typescript
import { makeBuildPrincipalAbilityUseCase, makeEntitlementRepository } from '@core/iam';
import { db } from '@/lib/db';

const entitlementRepository = makeEntitlementRepository(db);
const buildAbility = makeBuildPrincipalAbilityUseCase(entitlementRepository);

// Build ability for specific tenant
const result = await buildAbility({
  principalId: "cuid_user_alice",
  tenantId: "cuid_tenant_acme"
});

if (!result.success) {
  console.error('Failed to build ability');
  return;
}

const ability = result.value;

// Use ability for multiple checks (no database queries)
console.log(ability.can('create', 'campaigns'));  // true/false
console.log(ability.can('update', 'campaigns', { tenantId: 'cuid_tenant_acme' })); // true/false
console.log(ability.can('delete', 'campaigns', { principalId: 'cuid_user_alice' })); // true/false

// Check multiple resources efficiently
const campaigns = [
  { id: '1', tenantId: 'cuid_tenant_acme' },
  { id: '2', tenantId: 'cuid_tenant_acme' },
  { id: '3', tenantId: 'cuid_tenant_other' }
];

const editable = campaigns.filter(c => ability.can('update', 'campaigns', c));
console.log(`Alice can edit ${editable.length} campaigns`);
```

---

## Integration Guide

### Example 1: Setting Up the Module

**Step 1: Wire Up Repositories**

```typescript
// app/lib/iam.ts
import {
  makePolicyRepository,
  makeEntitlementRepository,
  makeCreatePolicyUseCase,
  makeGrantEntitlementUseCase,
  makeBuildPrincipalAbilityUseCase
} from '@core/iam';
import { db } from './db'; // Your Drizzle database instance

// Create repository instances
const policyRepository = makePolicyRepository(db);
const entitlementRepository = makeEntitlementRepository(db);

// Instantiate use cases with repositories
export const createPolicy = makeCreatePolicyUseCase(policyRepository);
export const grantEntitlement = makeGrantEntitlementUseCase(
  entitlementRepository,
  policyRepository
);
export const buildPrincipalAbility = makeBuildPrincipalAbilityUseCase(
  entitlementRepository
);

// Export all use cases you need...
```

---

### Example 2: Defining Policies for a SaaS App

**Seed Script: Create Platform and Tenant Policies**

```typescript
// scripts/seed.ts
import { createPolicy } from '../app/lib/iam';

async function seedPolicies() {
  // Platform-level policies
  const platformAdmin = await createPolicy({
    name: "platform_admin",
    scope: "PLATFORM",
    actions: [
      "users:manage:all",
      "tenants:create:all",
      "tenants:read:all",
      "tenants:update:all",
      "tenants:delete:all",
      "policies:manage:all",
      "billing:manage:all"
    ],
    description: "Full platform administrative access"
  });

  const platformOperator = await createPolicy({
    name: "platform_operator",
    scope: "PLATFORM",
    actions: [
      "users:read:all",
      "tenants:read:all",
      "support:manage:all"
    ],
    description: "Platform support and monitoring"
  });

  // Tenant-level policies
  const tenantAdmin = await createPolicy({
    name: "tenant_admin",
    scope: "TENANT",
    actions: [
      "campaigns:manage:team",
      "creators:manage:team",
      "deliverables:manage:team",
      "members:invite:team",
      "members:remove:team",
      "settings:update:team"
    ],
    description: "Full tenant administrative access"
  });

  const campaignManager = await createPolicy({
    name: "campaign_manager",
    scope: "TENANT",
    actions: [
      "campaigns:create:team",
      "campaigns:read:team",
      "campaigns:update:team",
      "campaigns:delete:own",
      "creators:invite:team",
      "deliverables:read:team",
      "deliverables:update:own"
    ],
    description: "Manage campaigns and creators"
  });

  const tenantMember = await createPolicy({
    name: "tenant_member",
    scope: "TENANT",
    actions: [
      "campaigns:read:team",
      "creators:read:team",
      "deliverables:read:own",
      "deliverables:update:own"
    ],
    description: "Basic tenant member access"
  });

  console.log('Policies created successfully');
}

seedPolicies();
```

---

### Example 3: Onboarding a New Tenant Member

**When a user joins an organization:**

```typescript
// app/api/tenants/[tenantId]/members/invite/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { grantEntitlement } from '@/lib/iam';
import { getPolicyByName } from '@/lib/iam-helpers'; // Your helper that wraps repository
import { getCurrentPrincipal } from '@/lib/auth'; // Your auth helper

export async function POST(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  // Get authenticated principal
  const currentPrincipal = await getCurrentPrincipal(request);
  if (!currentPrincipal) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { principalId, policyName } = body;

  // Look up policy by name using your helper
  const policy = await getPolicyByName(policyName);

  if (!policy) {
    return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
  }

  // Grant entitlement
  const result = await grantEntitlement({
    principalId,
    policyId: policy.id,
    tenantId: params.tenantId,
    grantedByPrincipalId: currentPrincipal.id
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({
    message: 'Member invited successfully',
    entitlement: result.value
  });
}
```

---

### Example 4: Protecting an API Route (Next.js)

**Authorization Guard Pattern:**

```typescript
// app/api/campaigns/[campaignId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { evaluateAccess } from '@/lib/iam';
import { getCurrentPrincipal } from '@/lib/auth';
import { getCampaignById } from '@/lib/campaigns'; // Your campaign repository wrapper

export async function PUT(
  request: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  // Step 1: Authenticate
  const principal = await getCurrentPrincipal(request);
  if (!principal) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Step 2: Get the resource (to check conditions)
  const campaign = await getCampaignById(params.campaignId);

  if (!campaign) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Step 3: Check permission
  const accessResult = await evaluateAccess({
    principalId: principal.id,
    action: "campaigns:update:team",
    tenantId: campaign.tenantId,
    resource: campaign  // For scope-based conditions
  });

  if (!accessResult.success || !accessResult.value.allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Step 4: Perform update
  const body = await request.json();
  const updated = await updateCampaign(params.campaignId, body);

  return NextResponse.json(updated);
}
```

---

### Example 5: Middleware Pattern (Build Once, Use Many Times)

**Request-Level Authorization Middleware:**

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { buildPrincipalAbility } from '@/lib/iam';
import { getCurrentPrincipal, getTenantIdFromRequest } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const principal = await getCurrentPrincipal(request);

  if (!principal) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const tenantId = getTenantIdFromRequest(request);

  // Build ability once
  const abilityResult = await buildPrincipalAbility({
    principalId: principal.id,
    tenantId
  });

  if (!abilityResult.success) {
    return NextResponse.json(
      { error: 'Failed to load permissions' },
      { status: 500 }
    );
  }

  // Attach ability to request context (Next.js middleware doesn't support this directly,
  // but you can store in a cookie or header for downstream use)
  const response = NextResponse.next();

  // In practice, you'd serialize ability rules or store in session
  // For demonstration, we'll show how routes would use it:
  return response;
}

// Then in your route handlers:
export async function GET(request: NextRequest) {
  const ability = await getAbilityFromRequest(request); // Your helper

  // Use for multiple checks without database queries
  if (!ability.can('read', 'campaigns')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const campaigns = await listCampaigns(); // Your repository wrapper

  // Filter campaigns based on permissions
  const allowedCampaigns = campaigns.filter(campaign =>
    ability.can('read', 'campaigns', campaign)
  );

  return NextResponse.json(allowedCampaigns);
}
```

---

### Example 6: Frontend Permission Checking

**React Component with Permission-Based UI:**

```typescript
// app/campaigns/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { AppAbility } from '@core/iam/infrastructure/CASLAbilityFactory';
import { createMongoAbility } from '@casl/ability';

export default function CampaignPage({ params }: { params: { id: string } }) {
  const [campaign, setCampaign] = useState(null);
  const [ability, setAbility] = useState<AppAbility | null>(null);

  useEffect(() => {
    async function loadData() {
      // Fetch campaign data
      const campaignRes = await fetch(`/api/campaigns/${params.id}`);
      const campaignData = await campaignRes.json();
      setCampaign(campaignData);

      // Fetch user's ability (from your API)
      const abilityRes = await fetch('/api/auth/ability');
      const abilityRules = await abilityRes.json();

      // Reconstruct ability from rules (you'd use CASL's packRules/unpackRules)
      const userAbility = createMongoAbility(abilityRules);
      setAbility(userAbility);
    }
    loadData();
  }, [params.id]);

  if (!campaign || !ability) return <div>Loading...</div>;

  return (
    <div>
      <h1>{campaign.name}</h1>

      {/* Conditional rendering based on permissions */}
      {ability.can('update', 'campaigns', campaign) && (
        <button onClick={handleEdit}>Edit Campaign</button>
      )}

      {ability.can('delete', 'campaigns', campaign) && (
        <button onClick={handleDelete}>Delete Campaign</button>
      )}

      {ability.can('assign', 'creators') && (
        <button onClick={handleInviteCreators}>Invite Creators</button>
      )}

      {!ability.can('update', 'campaigns', campaign) && (
        <p className="text-gray-500">You don't have permission to edit this campaign</p>
      )}
    </div>
  );
}
```

---

## Action String Reference

### Format Specification

All action strings follow this format:

```
resource:action:scope
```

**Rules:**
- Must contain exactly 3 parts separated by colons
- No part can be empty
- Scope must be one of: `own`, `team`, `all`

### Standard Actions

| Action | Meaning | Typical Use Case |
|--------|---------|------------------|
| `create` | Create new resources | Creating campaigns, users, etc. |
| `read` | View/query resources | Listing, viewing details |
| `update` | Modify existing resources | Editing campaigns, updating profiles |
| `delete` | Remove resources | Deleting campaigns, removing members |
| `assign` | Assign resources to others | Assigning creators to campaigns |
| `manage` | Any action (wildcard) | Full admin control over resource type |

### Standard Scopes

| Scope | Access Level | CASL Condition | When to Use |
|-------|-------------|----------------|-------------|
| `all` | Unrestricted | None | Platform admins, global operations |
| `team` | Tenant-scoped | `{ tenantId: "..." }` | Team members, organization-level access |
| `own` | Owner-scoped | `{ principalId: "..." }` | Personal resources, user-owned data |

### Example Permission Matrix

| Role | Action | Resource | Scope | Meaning |
|------|--------|----------|-------|---------|
| Platform Admin | `users:manage:all` | users | all | Full user management across platform |
| Platform Operator | `tenants:read:all` | tenants | all | View all tenant information |
| Tenant Admin | `campaigns:manage:team` | campaigns | team | Full campaign management in tenant |
| Campaign Manager | `campaigns:create:team` | campaigns | team | Create campaigns in tenant |
| Campaign Manager | `campaigns:update:team` | campaigns | team | Update any campaign in tenant |
| Campaign Manager | `campaigns:delete:own` | campaigns | own | Delete only own campaigns |
| Tenant Member | `deliverables:read:team` | deliverables | team | View all deliverables in tenant |
| Tenant Member | `deliverables:update:own` | deliverables | own | Update only own deliverables |

### Creating Custom Actions

You can define application-specific resources and actions:

```typescript
// Examples for a campaign management app
const actions = [
  "campaigns:create:team",
  "campaigns:read:team",
  "campaigns:update:team",
  "campaigns:delete:own",
  "campaigns:archive:team",
  "campaigns:publish:team",

  "creators:invite:team",
  "creators:approve:team",
  "creators:reject:team",

  "deliverables:request:team",
  "deliverables:review:team",
  "deliverables:approve:team",

  "payments:process:team",
  "payments:refund:team",

  "analytics:view:team",
  "reports:export:team"
];
```

**Guidelines:**
- Use plural resource names (`campaigns`, not `campaign`)
- Use lowercase for all parts
- Choose action verbs that clearly describe the operation
- Use `manage` sparingly (only for full admin roles)
- Prefer specific actions over broad wildcards for better audit trails

---

## Error Handling

### AccessError Class

```typescript
class AccessError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'AccessError';
  }
}
```

### Complete Error Code Reference

| Code | Use Case | HTTP Status | Description |
|------|----------|-------------|-------------|
| `POLICY_EXISTS` | Create policy | 400 | Policy name already exists (among active policies) |
| `POLICY_NOT_FOUND` | Policy operations | 404 | Policy does not exist or is soft-deleted |
| `VALIDATION_ERROR` | Input validation | 400 | Invalid policy name, actions, or action format |
| `INVALID_INPUT` | Input validation | 400 | Empty actions array or missing required fields |
| `INVALID_ACTION` | Action validation | 400 | Action string has invalid format |
| `GRANT_DENIED` | Grant entitlement | 403 | Policy scope mismatch or duplicate entitlement |
| `ENTITLEMENT_NOT_FOUND` | Revoke entitlement | 404 | Principal does not have this policy in this context |
| `NO_ENTITLEMENTS` | Build ability | 404 | Principal has no entitlements at all |
| `CONTEXT_NOT_FOUND` | Resolve permissions | 404 | No entitlements found for specified context |
| `SERVICE_ERROR` | System errors | 500 | Unexpected database or system error |

### Handling Result Types

All use cases return `Result<T, E>` types. You must check `success` before accessing `value` or `error`.

**Pattern 1: Early Return on Failure**
```typescript
const result = await createPolicy(data);

if (!result.success) {
  // TypeScript knows result.error exists here
  console.error(`Error: ${result.error.code} - ${result.error.message}`);
  return;
}

// TypeScript knows result.value exists here
const policy = result.value;
console.log(`Created policy: ${policy.id}`);
```

**Pattern 2: HTTP Response Mapping**
```typescript
const result = await grantEntitlement(data);

if (!result.success) {
  const statusCode = getStatusFromErrorCode(result.error.code);
  return NextResponse.json(
    { error: result.error.message, code: result.error.code },
    { status: statusCode }
  );
}

return NextResponse.json(result.value, { status: 201 });

function getStatusFromErrorCode(code: string): number {
  switch (code) {
    case 'POLICY_NOT_FOUND':
    case 'ENTITLEMENT_NOT_FOUND':
    case 'CONTEXT_NOT_FOUND':
    case 'NO_ENTITLEMENTS':
      return 404;
    case 'GRANT_DENIED':
      return 403;
    case 'VALIDATION_ERROR':
    case 'INVALID_INPUT':
    case 'INVALID_ACTION':
    case 'POLICY_EXISTS':
      return 400;
    case 'SERVICE_ERROR':
    default:
      return 500;
  }
}
```

**Pattern 3: Error Logging and Monitoring**
```typescript
const result = await evaluateAccess(data);

if (!result.success) {
  // Log to monitoring service
  logger.error('Access evaluation failed', {
    errorCode: result.error.code,
    errorMessage: result.error.message,
    principalId: data.principalId,
    action: data.action,
    tenantId: data.tenantId
  });

  // Send to error tracking (e.g., Sentry)
  Sentry.captureException(result.error, {
    tags: { errorCode: result.error.code }
  });

  return { allowed: false };
}

return result.value;
```

---

## Soft Delete Behavior

The IAM module uses a **soft delete strategy** for data integrity and audit compliance.

### What is Soft Delete?

Instead of physically removing records from the database (`DELETE FROM ...`), soft delete sets a `deletedAt` timestamp. The record remains in the database but is hidden from normal queries.

```sql
-- Hard delete (NEVER do this)
DELETE FROM policies WHERE id = 'abc123';

-- Soft delete (ALWAYS do this)
UPDATE policies SET deleted_at = NOW() WHERE id = 'abc123';
```

### Policy Soft Deletion

**When a policy is soft-deleted:**
1. `policy.deletedAt` is set to current timestamp
2. The policy **disappears** from all queries (zombie shield)
3. Existing entitlements that reference this policy **stop resolving**
4. Building an ability with these entitlements **excludes** the soft-deleted policy's actions
5. Permission checks **fail** as if the entitlement never existed

**Example:**
```typescript
// Alice has entitlement with "campaign_manager" policy
const ability = await buildPrincipalAbility({ principalId: "alice" });
console.log(ability.can('create', 'campaigns')); // true

// Admin soft-deletes the "campaign_manager" policy via repository
await policyRepository.softDelete(campaignManagerPolicyId);

// Alice's entitlement still exists, but policy is gone
const newAbility = await buildPrincipalAbility({ principalId: "alice" });
console.log(newAbility.can('create', 'campaigns')); // false (policy is zombie)
```

### Entitlement Soft Deletion

**When an entitlement is soft-deleted:**
1. `entitlement.deletedAt` is set to current timestamp
2. The entitlement **disappears** from all queries
3. The principal **loses access** granted by this entitlement immediately
4. The underlying policy remains active (can be granted to other principals)

**Example:**
```typescript
// Revoke entitlement (soft delete)
await revokeEntitlement({
  principalId: "alice",
  policyId: campaignManagerPolicyId,
  tenantId: "tenant_acme"
});

// Alice can no longer perform actions from that policy in that tenant
const result = await evaluateAccess({
  principalId: "alice",
  action: "campaigns:create:team",
  tenantId: "tenant_acme"
});
console.log(result.value.allowed); // false
```

### Zombie Shield Guarantee

The **Zombie Shield** is the architectural pattern that ensures soft-deleted data is invisible to application code.

**Every repository query MUST include:**
```typescript
where: {
  deletedAt: null,  // Only active records

  // For nested relations (Entitlements include Policy)
  policy: {
    deletedAt: null  // Only active policies
  }
}
```

**What this protects against:**
- Accidentally querying deleted policies
- Resolving entitlements with deleted policies
- Granting duplicate entitlements (partial unique indexes ignore deleted records)
- Reusing policy names after deletion (partial unique indexes)

**Developer Safety:**
- Even if you forget to check `deletedAt`, the repositories enforce it
- The infrastructure layer acts as a mandatory firewall
- Application code cannot accidentally read zombie data

### Physical Cleanup (The Sweeper)

Soft-deleted records remain in the database indefinitely until physically cleaned up by a background process.

**The Sweeper (Future Implementation):**
- Scheduled cron job (e.g., nightly)
- Finds records with `deletedAt` older than retention period (e.g., 90 days)
- Physically deletes them (`DELETE FROM ...`)
- Handles cascading cleanup across soft-linked modules
- Ensures GDPR compliance and prevents database bloat

**Why Deferred Cleanup?**
- **Speed:** Soft delete is instant (single UPDATE query)
- **Audit:** Records remain available for compliance/legal review
- **Safety:** Accidental deletions can be recovered within retention window
- **Performance:** Physical cleanup happens during off-peak hours

---

## Design Decisions

### Why Policy + Entitlement instead of Role + Permission + RoleAssignment?

**Traditional RBAC Model:**
```
Role (Admin, Editor, Viewer)
  → RolePermission (many-to-many join table)
    → Permission (create_campaign, edit_campaign, delete_campaign)
  → RoleAssignment (User → Role → Organization)
```

**Problems:**
- Permission explosion (100s of granular permissions)
- Complex many-to-many relationships
- Difficult to audit "who can do what"
- Roles become rigid over time

**Nucleus IAM Model:**
```
Policy (named bundle of actions)
  → actions: ["campaigns:create:team", "campaigns:update:team"]
Entitlement (Principal → Policy → Tenant)
```

**Benefits:**
- **Simpler model:** 2 tables instead of 4
- **Agnostic terminology:** No "User" or "Organization" coupling
- **Additive permissions:** Union of all policy actions = effective permissions
- **Flexible scoping:** Same action string can have different scopes
- **Audit trail:** `grantedByPrincipalId` tracks delegation chains (critical for AI agents)

---

### Why JSON Array for Actions instead of Separate Permission Table?

**Alternative Design:**
```
Permissions Table:
  id | resource | action | scope

Policy_Permissions Join Table:
  policy_id | permission_id
```

**Why we rejected this:**
1. **Over-normalization:** Actions are simple strings, not complex entities
2. **Query complexity:** Requires JOIN to get policy actions (slower)
3. **Permission explosion:** 100s of rows for what should be 10 policies
4. **Update complexity:** Updating policy actions requires INSERT/DELETE on join table

**JSON Array Advantages:**
- Single database column (fast read)
- Atomic updates (replace entire array)
- No JOIN overhead
- Drizzle natively supports JSON types via `jsonb()` with `$type<T>()`
- Actions are validated by domain layer, not database schema

**Trade-off:**
- Cannot query "which policies have campaigns:create:team" efficiently
- Not a problem because we always query by policy (not by action)

---

### Why Soft Links instead of Foreign Keys for Cross-Module Refs?

**Nucleus Philosophy:** Modules must remain **isolated** and **independently replaceable**.

**Hard Foreign Key Problems:**
```sql
-- If Identity module adds FK to Entitlement:
ALTER TABLE entitlements
ADD CONSTRAINT fk_principal
FOREIGN KEY (principal_id) REFERENCES principals(id);
```

**This creates coupling:**
- Cannot deploy IAM module without Identity module
- Cannot drop Identity tables without breaking IAM
- Database-level entanglement prevents modular evolution
- Microservice migration becomes impossible

**Soft Link Solution:**
```typescript
principalId: string;  // Plain text UUID (NO FK constraint)
```

**Benefits:**
- **Module isolation:** IAM can deploy independently
- **Replaceable modules:** Can swap Identity implementation without touching IAM
- **Graceful degradation:** If Identity service is down, IAM still functions
- **Microservice-ready:** Can split modules into separate databases later

**Trade-off:**
- No referential integrity at database level
- Requires application-level validation (use cases check existence)
- Orphaned references possible (handled by Sweeper reconciliation)

---

### Why CASL for Evaluation?

**CASL** (Code Access Specification Library) is the de facto standard for JavaScript/TypeScript authorization.

**Why we use it:**
1. **Battle-tested:** Used by thousands of production apps
2. **Condition-based rules:** Supports `{ tenantId: "..." }` and `{ principalId: "..." }` checks
3. **Declarative API:** `ability.can('read', 'campaigns', resource)` is intuitive
4. **Framework-agnostic:** Works server-side and client-side
5. **TypeScript support:** Fully typed with inference

**How we integrate it:**
- CASL lives in **infrastructure layer** (it's a technical tool)
- Domain layer defines action format (`resource:action:scope`)
- Infrastructure translates domain actions → CASL rules
- Application layer calls CASL for runtime evaluation

**Alternative considered:**
- Custom permission evaluation logic
- Rejected because: reinventing the wheel, less community support, more maintenance

---

### Why Factory Pattern for Use Cases?

**Higher-order function pattern:**
```typescript
const makeCreatePolicyUseCase = (repo: IPolicyRepository) => {
  return async (data: CreatePolicyInput) => {
    // Use case implementation
  };
};
```

**Benefits:**
1. **Dependency injection:** Repositories injected at instantiation
2. **Testability:** Can inject mock repositories for unit tests
3. **Single responsibility:** Factory configures, function executes
4. **Immutability:** Use case function is pure (no hidden state)
5. **DDD compliance:** Follows functional, data-oriented approach

**Why NOT service classes?**
```typescript
// Anti-pattern (never do this)
class PolicyService {
  constructor(private repo: IPolicyRepository) {}
  async createPolicy(data: CreatePolicyInput) { ... }
}
```

**Problems with classes:**
- Encourages stateful services
- Violates functional programming principles
- More boilerplate (constructor, this keyword)
- Harder to test (need to mock entire class)

---

## Extending This Module

### Adding New Use Cases

**Step 1: Define Use Case in Application Layer**

```typescript
// application/archivePolicyUseCase.ts
import { Result } from '@shared/lib/result';
import { IPolicyRepository } from '../domain/policyRepository';
import { AccessError } from './accessError';

export type ArchivePolicyInput = {
  policyId: string;
};

export const makeArchivePolicyUseCase = (
  policyRepository: IPolicyRepository
) => {
  return async (data: ArchivePolicyInput): Promise<Result<void, AccessError>> => {
    try {
      const policy = await policyRepository.findById(data.policyId);

      if (!policy) {
        return {
          success: false,
          error: new AccessError('Policy not found', 'POLICY_NOT_FOUND')
        };
      }

      // Soft delete the policy
      await policyRepository.softDelete(data.policyId);

      return { success: true, value: undefined };
    } catch {
      return {
        success: false,
        error: new AccessError('Failed to archive policy', 'SERVICE_ERROR')
      };
    }
  };
};
```

**Step 2: Wire Up in Your Application**

```typescript
// app/lib/iam.ts
import { makeArchivePolicyUseCase, makePolicyRepository } from '@core/iam';
import { db } from './db';

const policyRepository = makePolicyRepository(db);
export const archivePolicy = makeArchivePolicyUseCase(policyRepository);
```

---

### Adding a Custom Repository Implementation

**Step 1: Implement the Interface**

```typescript
// infrastructure/repositories/MongoDBPolicyRepository.ts
import { IPolicyRepository } from '../../domain/policyRepository';
import { Policy, PolicyScope } from '../../domain/policy';
import { MongoClient } from 'mongodb';

export class MongoDBPolicyRepository implements IPolicyRepository {
  constructor(private client: MongoClient) {}

  async findById(policyId: string): Promise<Policy | null> {
    const db = this.client.db('nucleus');
    const doc = await db.collection('policies').findOne({
      _id: policyId,
      deletedAt: null  // Zombie shield
    });

    if (!doc) return null;

    return {
      id: doc._id,
      name: doc.name,
      scope: doc.scope as PolicyScope,
      actions: doc.actions,
      description: doc.description,
      deletedAt: doc.deletedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  }

  // ... implement all other methods
}
```

**Step 2: Wire Up the New Repository**

```typescript
// app/lib/iam.ts
import { MongoClient } from 'mongodb';
import { MongoDBPolicyRepository } from '@core/iam/infrastructure/repositories/MongoDBPolicyRepository';
import { makeCreatePolicyUseCase } from '@core/iam';

const mongoClient = new MongoClient(process.env.MONGODB_URL);
const policyRepo = new MongoDBPolicyRepository(mongoClient);

export const createPolicy = makeCreatePolicyUseCase(policyRepo);
```

---

### How Application Layers Should Consume This Module

**Best Practice: CASL at Application Level**

Your application should build the ability **once per request** and use it for all checks in that request context.

```typescript
// app/lib/permissions.ts
import { makeBuildPrincipalAbilityUseCase, makeEntitlementRepository } from '@core/iam';
import { AppAbility } from '@core/iam/infrastructure/CASLAbilityFactory';
import { db } from './db';

const entitlementRepository = makeEntitlementRepository(db);
const buildAbility = makeBuildPrincipalAbilityUseCase(entitlementRepository);

export async function getAbilityForRequest(
  principalId: string,
  tenantId?: string | null
): Promise<AppAbility> {
  const result = await buildAbility({ principalId, tenantId });

  if (!result.success) {
    throw new Error('Failed to build ability');
  }

  return result.value;
}

// Use in middleware
export async function authMiddleware(req: Request) {
  const principal = await authenticatePrincipal(req);
  const tenantId = extractTenantId(req);

  const ability = await getAbilityForRequest(principal.id, tenantId);

  // Attach to request context
  req.ability = ability;
  req.principalId = principal.id;
  req.tenantId = tenantId;

  return next();
}

// Use in route handlers
export async function GET(req: Request) {
  const ability = req.ability; // Retrieved from middleware

  if (!ability.can('read', 'campaigns')) {
    return new Response('Forbidden', { status: 403 });
  }

  // Proceed with query...
}
```

---

## Dependencies

### Runtime Dependencies

- **@casl/ability** `^6.0.0` - Permission evaluation engine
- **drizzle-orm** - ORM (schema-as-code, relational queries)
- **pg** - PostgreSQL driver
- **@paralleldrive/cuid2** - ID generation

### Dev Dependencies

- **drizzle-kit** - Migration tooling
- **@types/pg** - TypeScript types for PostgreSQL

### Peer Dependencies

- **TypeScript** `^5.0.0` - Type system
- **PostgreSQL** `^12.0` - Database (or compatible)

### Optional Dependencies

- **@core/identity** - Identity module (for principal management)
- **@core/tenancy** - Tenancy module (for tenant management)

---

## Related Modules

This module is part of the Nucleus architecture core:

- **@core/identity** - Authentication and principal lifecycle
- **@core/tenancy** - Multi-tenancy and organizational hierarchy
- **@core/billing** - Subscription and monetization
- **@core/notifications** - Cross-module notification delivery

---

## License

This module is part of the Nucleus project. See the root LICENSE file for details.

---

## Support

For questions, issues, or contributions, please refer to the main Nucleus repository.

---

**Built with the Nucleus Philosophy:** Speed through quality. Isolation through discipline. AI-era ready.
