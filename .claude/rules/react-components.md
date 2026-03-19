---
paths:
  - "**/*.tsx"
  - "**/page.tsx"
  - "**/layout.tsx"
---

# React & TSX File Rules

TSX files are the presentation layer. They render UI and call Server Actions. They never access databases, APIs, or external services directly.

## The boundary

TSX files (pages, layouts, components, containers) sit at the top of the data flow:

```
TSX files → Server Actions (actions.ts) → Use Cases → Repositories → External Services
```

TSX files call Server Actions. Server Actions call use cases. That's it. There are no shortcuts through this chain.

## What is forbidden in any .tsx file

- No ORM imports or database access (Prisma, Drizzle, Knex, Sequelize, raw SQL)
- No direct `fetch()` calls to external APIs
- No axios, got, or any HTTP client library
- No direct cloud storage access (S3, GCS, Azure Blob)
- No repository imports — repositories are infrastructure, not presentation
- No use case imports — use cases are called by Server Actions, not by components

## What belongs in TSX files

- JSX rendering and component composition
- Client-side React hooks (useState, useEffect, etc.) in client components
- Calls to Server Actions defined in `actions.ts`
- Reading props and URL params passed from Server Components
- Client-side form handling and UI state

## For page.tsx and layout.tsx specifically

Server Components (page.tsx, layout.tsx) may receive data from the server layer (via nexus agent's data orchestration) but must not query databases or call APIs themselves. Data fetching logic belongs in Server Actions or in the server component's data layer — never inline with JSX.

If you need data in a page, create a Server Action in `actions.ts` that calls a use case. The page calls the action.
