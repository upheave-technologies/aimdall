# CLAUDE.md

<!-- nucleus:fixed:start -->
## Nucleus-Powered Project

This project is built on [Nucleus](https://github.com/upheave-technologies/nucleus) — a modular foundation for building applications with AI-assisted development.

### Core Conventions

- **Domain-Driven Design**: Code is organized by business domain, not by technology. Each module contains domain, application, and infrastructure layers.
- **Inward dependencies**: Infrastructure depends on application and domain. Application depends on domain. Domain depends on nothing external.
- **Functional patterns**: Prefer pure functions and TypeScript types/interfaces over classes. Use higher-order functions for dependency injection.
- **Business logic in domain only**: Validation rules, state transitions, and business decisions belong in the domain layer. Database queries, API calls, and framework code belong in infrastructure.
- **Repository boundary**: All external access (databases, APIs, storage) is encapsulated behind repository interfaces defined in the domain layer and implemented in infrastructure.

### Agent-Assisted Workflow

This project uses specialized Claude Code agents for different tasks. Use the agent roster below to determine which agent handles which responsibility. Never write code directly — always delegate to the appropriate agent.

### Building Block Management

Building blocks in this project are managed by the Nucleus CLI:
- `nucleus list` — See all available building blocks
- `nucleus add <block>` — Install a building block
- `nucleus remove <block>` — Remove a building block
- `nucleus status` — Check for updates and local modifications
- `nucleus update <block>` — Update a building block from upstream

The **dynamic zone** below is automatically managed by the CLI. Do not edit it manually.
The **custom zone** at the bottom is yours — add project-specific instructions there.
<!-- nucleus:fixed:end -->

<!-- nucleus:dynamic:start -->
### Agent Roster

| Agent | Description |
|-------|-------------|
| **archie** | Database architect — schema design, migrations, data modeling |
| **donnie** | Backend DDD engineer — use cases, repositories, API routes |
| **frankie** | Frontend specialist — React components, containers, JSX, design systems |
| **nexus** | Next.js server-side specialist — Server Components, Server Actions |
| **plancton** | Project planner — task breakdown and implementation planning |
| **prince** | Product requirements analyst — PRD creation and discovery |
| **rufus** | Technical architect — RFC creation, design decisions |
| **tesseract** | Test engineer — test creation, verification, coverage |

### Active Rules

The following architectural rules are enforced in this project:

- **application-layer**: Application layer patterns — use cases, orchestration, error handling
- **ddd-architecture**: Core DDD principles — layered architecture, inward dependencies, functional patterns
- **domain-layer**: Domain layer patterns — entities, value objects, repository interfaces
- **infrastructure-layer**: Infrastructure layer patterns — repository implementations, external services
- **nucleus-readonly**: Instructs agents that nucleus-installed package files are read-only
- **page-architecture**: Page.tsx contract — authentication, data fetching, component delegation
- **project-structure**: Top-level directory placement — business modules vs core packages
- **react-components**: React component patterns — containers, presentational components, hooks
- **server-actions**: Server action patterns — thin adapters, module barrel imports, use case delegation
- **server-first-react**: Server Components by default — minimum client surface principle, decomposition test

### Active Hooks

The following validation hooks run automatically:

- **architecture-guard**: Validates DDD architecture compliance on code changes
- **build-check**: Runs TypeScript compilation check before commits
- **frankie-scope-guard**: Validates that Frankie agent operates only in frontend-appropriate locations
- **nucleus-guard**: Prevents modification of nucleus-installed package files in consuming repos
- **orchestrator-guard**: Prevents the main orchestrator from writing source code — delegates to specialized agents

### Available Skills

- **ddd-patterns**: DDD code patterns and examples for domain, application, and infrastructure layers
- **frontend-guideline**: React component architecture protocols — server-first, state separation, design system
- **prover**: Scenario prover — run capability checks, interpret verdicts, write scenarios, add annotations

### Installed Packages

| Package | Description | Dependencies |
|---------|-------------|--------------|
| **auth** | Credential management and verification — passwords, API keys, OAuth | shared, identity |
| **iam** | Policy evaluation and access control — RBAC, entitlements, CASL integration | shared, identity |
| **identity** | Principal lifecycle management — create, update, deactivate, suspend | shared |
| **shared** | Common utilities, types, and helpers used across all packages | none |
<!-- nucleus:dynamic:end -->

<!-- nucleus:custom:start -->


