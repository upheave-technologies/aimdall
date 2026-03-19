---
paths:
  - "**/domain/**"
---

# Domain Layer Rules

You are working in the domain layer — the pure heart of the module. Everything here must be framework-agnostic and side-effect-free.

## What belongs here
- TypeScript type and interface definitions for business entities
- Pure functions containing business rules, validation, and state transitions
- Repository interfaces (type definitions that declare what persistence is needed — not how)
- Domain error types

## How to structure files
- One file per domain entity. All types and pure functions for that entity live together in one file (e.g., `campaign.ts` contains Campaign type, validateCampaignName, createCampaign, transitionStatus).
- One file per repository interface (e.g., `campaignRepository.ts`).

## Mandatory patterns
- Return `Result<T, E>` from functions instead of throwing exceptions. This makes error handling explicit and composable.
- Functions must be pure: same input always produces same output, no side effects.

## Absolute restrictions
- Zero imports from external libraries, frameworks, or ORMs.
- Zero imports from the application or infrastructure layers.
- Zero side effects: no database calls, no API requests, no file I/O, no logging.
- No dependency on any layer outside domain. Only imports from other domain files or shared utilities (like the Result type) are allowed.
