---
paths:
  - "app/**/*.tsx"
  - "app/**/_components/**"
  - "app/**/_containers/**"
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

## Server Components are the Default

Every `.tsx` file is a Server Component unless explicitly marked with `'use client'`. The `'use client'` directive is ONLY allowed in:

- `_containers/*.tsx` — files that genuinely need client state, hooks, or browser APIs
- `error.tsx` — Next.js requires error boundaries to be client components

This is enforced by architecture-guard.sh Rule 12. Any attempt to write `'use client'` outside these locations will be blocked.

## The _containers/ vs _components/ Boundary

| Directory | What lives here | `'use client'`? | Hooks? |
|-----------|----------------|-----------------|--------|
| `_components/` | Pure presentational — props → JSX | NEVER | NEVER (except `useFormStatus`) |
| `_containers/` | Data orchestration — fetch, memoize, prepare, compose | ONLY when interactivity is needed | Only in client containers |

Containers are **data orchestrators**, not necessarily client components. A container can be:
- A **server component** that fetches data, transforms it, and passes props to `_components/`
- A **client component** (`'use client'`) ONLY when it genuinely needs state, hooks, or browser APIs

`'use client'` in a container is **optional, not required**. Most containers should be server components.

## Push Client Boundaries to Leaves

Don't wrap an entire view in `'use client'`. Push interactivity to the smallest possible leaf component in `_containers/`. The parent view stays as a Server Component in `_components/`.
