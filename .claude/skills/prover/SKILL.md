---
name: prover
description: "How to operate the Nucleus scenario prover: run checks, interpret verdicts, write scenarios, add capability annotations, and register new effect tokens."
---

# Prover — Scenario Verification Engine

The prover answers: "Given the capabilities declared across all modules, can a desired cross-module workflow be achieved?" It uses forward-chaining: starting from an initial state, it iteratively fires eligible capabilities until all desired outcome effects are satisfied or progress stalls. Result is always PASS or FAIL.

Three concepts underpin the system:

1. **Capability annotations** — every use case file exports a `capability` constant that declares what must already be true (preconditions) and what becomes true (effects) after the use case succeeds.
2. **Manifests** — `capabilities.yml` files auto-generated from annotations, one per module. Never edit manually.
3. **Scenarios** — YAML files in `system/scenarios/` describing a desired cross-module workflow (initial state + desired outcome). These you write by hand.

---

## Commands

All commands are run from the repo root.

```bash
# Regenerate capabilities.yml from annotations in all use case files
npm run scenarios:generate

# Prove all scenarios
npm run scenarios:check

# Prove one scenario by exact name
npm run scenarios:check -- --scenario "Nucleus registration"

# JSON output (useful for scripting or piping)
npm run scenarios:check -- --json

# Validate manifests and scenarios only (no proving)
npm run scenarios:check -- --validate

# Execute passing proof chains against real PostgreSQL
npm run scenarios:run

# Execute one scenario against the database
npm run scenarios:run -- --scenario "Nucleus registration"
```

**When to use each:**
- After adding or changing a use case → `scenarios:generate` then `scenarios:check`
- After writing a new scenario → `scenarios:check -- --scenario "Name"` first
- To confirm all existing scenarios still pass → `scenarios:check`
- To validate YAML is well-formed → `scenarios:check -- --validate`
- To run a proof chain end-to-end against Postgres → `scenarios:run`

---

## Interpreting Output

### PASS verdict

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCENARIO: Nucleus registration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PASS

Proof Chain:
  1. [identity] create-principal → identity:principal:exists
  2. [auth] create-password-credential (credential_type: password) → auth:credential:exists
  3. [iam] create-policy → iam:policy:exists
  4. [iam] grant-entitlement → iam:entitlement:granted

Recipe:
  Step 1: Call makeCreatePrincipalUseCase from identity module
  Step 2: Call makeCreatePasswordCredentialUseCase from auth module (credential_type=password)
  Step 3: Call makeCreatePolicyUseCase from iam module
  Step 4: Call makeGrantEntitlementUseCase from iam module
```

- **Proof Chain** — the ordered list of capabilities the engine applied. Each step shows module, capability name, optional context, and the primary effect it contributes.
- **Recipe** — the same steps expressed as human-readable orchestration instructions naming the exact use case factory.

### FAIL verdict

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCENARIO: Tenant-scoped access setup
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FAIL

Gaps:
  x tenancy:membership:exists — No capability produces this effect

Partial Progress:
  + iam:entitlement:granted (via [iam] grant-entitlement)
```

- **Gaps** — every outcome effect that could not be satisfied, with a reason:
  - `No capability produces this effect` — the effect token does not appear in any manifest. The module that owns this capability doesn't exist yet, or the annotation is missing.
  - `No capability produces this effect with context matching where(credential_type="api_key")` — capabilities exist but none match the where-clause.
  - `Capability preconditions could not be met` — a capability that produces the effect exists, but its preconditions could never be satisfied from the initial state.
- **Partial Progress** — outcome effects that were satisfied before the engine stalled. Useful for diagnosing which part of the chain is broken.

---

## Writing Scenarios

Create a YAML file in `system/scenarios/`. File name should be kebab-case matching the scenario topic.

### Minimal scenario

```yaml
name: Nucleus API key verification
description: |
  A bot agent authenticates programmatically via API key.

initial_state:
  - identity:principal:exists
  - auth:credential:exists

outcome:
  - auth:credential:verified
```

- `name` — unique across all scenarios. Used with `--scenario` flag.
- `description` — plain-language narrative. Explain why the scenario matters.
- `initial_state` — effect tokens that are given as true at the start. Use an empty list `[]` if nothing is assumed.
- `outcome` — effect tokens that must all be true for the scenario to PASS.

### Outcome with where-clause

Use a where-clause when multiple capabilities produce the same effect but only one variant is acceptable:

```yaml
outcome:
  - auth:credential:verified
  - effect: auth:credential:exists
    where:
      credential_type: api_key
```

The where-clause is a key-value map that must match the `context` on the capability card. All keys in the where-clause must match; extra context keys on the capability are ignored.

### Ordering constraint

Use ordering when the scenario requires a specific sequencing between two outcome effects:

```yaml
outcome:
  - tenancy:membership:exists
  - iam:entitlement:granted

ordering:
  - tenancy:membership:exists -> iam:entitlement:granted
```

The engine will attempt topological reordering of the proof chain to satisfy ordering. If a cycle would result, the scenario FAILs.

---

## Adding Capability Annotations to Use Cases

Every file matching `packages/@core/*/application/*UseCase.ts` or `modules/*/application/*UseCase.ts` **must** export a `capability` constant. The generator errors out if any use case file is missing this export.

### Standard single annotation

```typescript
import { defineCapability } from '@/packages/shared/lib/capability';
import { CAPABILITIES } from '@/packages/shared/lib/capabilities';
import { EFFECTS } from '@/packages/shared/lib/effects';

export const capability = defineCapability({
  name: CAPABILITIES.iam.evaluateAccess,
  useCase: 'makeEvaluateAccessUseCase',
  preconditions: [EFFECTS.identity.principal.exists],
  effects: [EFFECTS.iam.access.evaluated],
});
```

- `name` — capability identifier from `CAPABILITIES`. Must be unique within the module.
- `useCase` — the factory function name (string, informational only — never imported by the prover).
- `preconditions` — effect tokens from `EFFECTS` that must be in state before this capability can fire. Use `[]` if none required.
- `effects` — effect tokens added to state when this capability succeeds. At least one required.

### With context (for where-clause matching)

```typescript
import { CONTEXTS } from '@/packages/shared/lib/contexts';

export const capability = defineCapability({
  name: CAPABILITIES.auth.createApiKey,
  useCase: 'makeCreateApiKeyUseCase',
  preconditions: [EFFECTS.identity.principal.exists],
  effects: [EFFECTS.auth.credential.exists],
  context: CONTEXTS.credentialType.apiKey,  // { credential_type: 'api_key' }
});
```

Context allows scenarios to use where-clauses to select a specific variant of a capability.

### Query capabilities (skipped by generator)

Use cases that are pure reads with no state change should be marked `query: true`. The generator will skip them — they do not appear in `capabilities.yml`.

```typescript
export const capability = defineCapability({
  name: CAPABILITIES.identity.getPrincipal,
  useCase: 'makeGetPrincipalUseCase',
  preconditions: [],
  effects: [],
  query: true,
});
```

### Multiple capabilities from one file (rare)

If a single use case file genuinely produces more than one capability, export an array:

```typescript
export const capabilities = [
  defineCapability({ name: '...', useCase: '...', preconditions: [], effects: [...] }),
  defineCapability({ name: '...', useCase: '...', preconditions: [], effects: [...] }),
];
```

---

## Effect Token Naming and Registration

### Format

```
{domain}:{entity}:{predicate}
```

All lowercase, hyphen-separated words within each segment.

Examples:
- `identity:principal:exists`
- `auth:credential:verified`
- `iam:entitlement:granted`
- `tenancy:membership:exists`

### Registering a new effect token

1. Open `/Users/mario/code/Labs/nucleus/packages/shared/lib/effects.ts`
2. Add the token under the appropriate domain and entity. If the domain or entity does not exist, add it:

```typescript
export const EFFECTS = {
  // ...existing...
  tenancy: {
    membership: {
      exists: 'tenancy:membership:exists',
      revoked: 'tenancy:membership:revoked',
    },
  },
} as const;
```

3. Use `EFFECTS.tenancy.membership.exists` in annotations and scenarios instead of the raw string. This makes cross-file connections compiler-verified and grep-able.

### Registering a new capability name

Open `/Users/mario/code/Labs/nucleus/packages/shared/lib/capabilities.ts` and add under the appropriate module:

```typescript
export const CAPABILITIES = {
  // ...existing...
  tenancy: {
    addMember: 'add-member',
    removeMember: 'remove-member',
  },
} as const;
```

### Registering a new context constant

Open `/Users/mario/code/Labs/nucleus/packages/shared/lib/contexts.ts` and add a new entry:

```typescript
export const CONTEXTS = {
  credentialType: { ... },  // existing
  memberRole: {
    key: 'member_role',
    admin: { member_role: 'admin' } as const,
    viewer: { member_role: 'viewer' } as const,
  },
} as const;
```

---

## Generator Workflow

The standard cycle when adding or modifying use cases:

```
1. Add/update capability annotation in the use case file
2. Register any new EFFECTS, CAPABILITIES, or CONTEXTS tokens in shared/lib/
3. npm run scenarios:generate     ← writes capabilities.yml
4. npm run scenarios:check        ← verify all scenarios still pass
```

The generator:
- Discovers all `*UseCase.ts` files in `packages/@core/*/application/` and `modules/*/application/`
- Dynamically imports each file and reads the `capability` or `capabilities` export
- Skips capabilities with `query: true`
- Sorts capabilities alphabetically within each module
- Writes `capabilities.yml` to the module root (e.g., `packages/@core/iam/capabilities.yml`)
- Emits drift warnings to stderr if a use case's code hash changed since last generation (the annotation may need updating)

**The generator errors out** if any use case file is missing the export. Fix all missing annotations before the generate command will succeed.

---

## Key File Locations

| Purpose | Path |
|---|---|
| Prover engine (pure computation) | `packages/prover/engine.ts` |
| CLI entry point | `packages/prover/cli.ts` |
| Scenario runner (executes against Postgres) | `packages/prover/run.ts` |
| Manifest/scenario generator | `packages/prover/generate.ts` |
| Type definitions | `packages/prover/types.ts` |
| Effect token constants | `packages/shared/lib/effects.ts` |
| Capability name constants | `packages/shared/lib/capabilities.ts` |
| Context constants | `packages/shared/lib/contexts.ts` |
| defineCapability helper | `packages/shared/lib/capability.ts` |
| Scenarios directory | `system/scenarios/` |
| Core module manifests | `packages/@core/*/capabilities.yml` |
| Application module manifests | `modules/*/capabilities.yml` |

---

## Troubleshooting

### Gap: "No capability produces this effect"

The effect token does not appear in any `capabilities.yml`. Causes:
- The module that owns the capability has not been implemented yet (expected — document with a description note in the scenario).
- The annotation is present but `npm run scenarios:generate` has not been run since it was added. Run the generator.
- The effect token string in the scenario does not match the string in the annotation. Check spelling and format.

### Gap: "Capability preconditions could not be met"

A capability that produces the required effect exists, but the engine could not satisfy its preconditions from the initial state. Causes:
- The scenario's `initial_state` is missing an effect that should be given as a precondition. Add it.
- A chain of capabilities is needed to reach the precondition, but one link in the chain is itself gapped. Check partial progress output to see where the chain broke.
- The precondition effect token in the annotation differs from what other capabilities produce. Cross-check `EFFECTS` constants.

### Gap: "No capability produces this effect with context matching where(...)"

Capabilities produce the effect, but none have a matching `context`. Causes:
- The where-clause value does not match any `CONTEXTS` constant. Check `contexts.ts`.
- The capability annotation is missing a `context` field. Add it using `CONTEXTS`.

### Generator drift warning

```
WARNING: create-api-key (auth) — use case code changed since last generation. Verify capability annotation is still accurate.
```

The use case file's code changed since the last `capabilities.yml` was written. Review the annotation to confirm preconditions and effects still accurately reflect what the use case does. Then re-run `scenarios:generate` to clear the warning.

### Generator fails: missing export

```
ERROR: The following use case files are missing a `capability` or `capabilities` export:
  packages/@core/auth/application/someNewUseCase.ts: missing 'capability' or 'capabilities' export
```

Every `*UseCase.ts` file must export a `capability` constant. Add the annotation (use `query: true` if it is a pure read with no state change).

### Ordering conflict

```
FAIL
Gaps:
  x tenancy:membership:exists -> iam:entitlement:granted — Ordering constraints conflict with precondition dependencies — cannot reorder proof chain
```

The requested ordering contradicts the precondition dependency graph (creating a cycle). The constraint `A -> B` cannot be satisfied if B's capability requires A as a precondition — that order is already forced by preconditions. Remove the redundant ordering constraint, or reconsider whether the ordering is genuinely necessary.
