---
paths:
  - "**/infrastructure/**"
---

# Infrastructure Layer Rules

You are working in the infrastructure layer — the only place where external services are accessed. All database queries, API calls, file storage operations, and third-party integrations live here.

## What belongs here
- Repository implementations: concrete code that implements the repository interfaces defined in the domain layer
- External service clients: code for interacting with third-party APIs, storage services, etc.
- Framework-specific adapters: CASL ability factories, auth providers, etc.
- Database type definitions and connection configuration

## Repository rules
- One repository per domain entity. A repository manages exactly one entity type. If you need `saveAsset()` and `saveDeliverable()`, those are two separate repositories.
- Use factory functions (`makeEntityRepository(db)`) for dependency injection, not classes.
- Implement the interface defined in the domain layer. The infrastructure layer serves the domain's contract.

## Soft-delete enforcement
- Every read query must filter out soft-deleted records. Include `isNull(deletedAt)` (or equivalent) in every SELECT/find operation. If deleted records appear in results, the application state is corrupted.
- Deletion from application code always sets `deletedAt` timestamp. Physical deletion is a separate background concern.

## This is the ONLY layer that may
- Import and use ORM libraries (Drizzle, Prisma, etc.)
- Make HTTP requests (fetch, axios, etc.)
- Access file systems, cloud storage, or external APIs
- Use database drivers or connection pools

No other layer in the module may do any of these things.
