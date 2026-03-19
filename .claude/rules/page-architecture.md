---
paths:
  - "**/page.tsx"
  - "**/layout.tsx"
---

# Page Architecture Rules

Every `page.tsx` file in `app/` is a **Server Component**. No exceptions.

## The Page Contract

A page file does exactly three things:

1. **Authenticate** — check session, redirect if unauthorized
2. **Fetch data** — call use cases via the module barrel
3. **Delegate rendering** — return a single component with data as props

```tsx
// ✅ CORRECT — page.tsx
import { redirect } from 'next/navigation';
import { getSessionPrincipalId, getProfile } from '@/modules/nucleus';
import { DashboardView } from './_components/dashboard-view';

export default async function DashboardPage() {
  const principalId = await getSessionPrincipalId();
  if (!principalId) redirect('/login');

  const result = await getProfile({ id: principalId });
  if (!result.success) redirect('/login');

  return <DashboardView principal={result.value} />;
}
```

## What is FORBIDDEN in page.tsx

| Forbidden | Why | Where it belongs |
|-----------|-----|-----------------|
| `'use client'` | Pages are always Server Components | `_containers/*.tsx` |
| `useState`, `useEffect`, any hook | Client state has no place in a server component | `_containers/*.tsx` |
| Raw HTML (`<div>`, `<form>`, `<input>`, etc.) | Pages delegate rendering, they don't render | `_components/*.tsx` or `_containers/*.tsx` |
| Event handlers (`onClick`, `onSubmit`, etc.) | These require client runtime | `_containers/*.tsx` |
| `window`, `document`, browser APIs | Server components have no browser | `_containers/*.tsx` |

## The Component Hierarchy

Containers are **data orchestrators** — they can be server or client components.

When a page is data-driven (most common):

```
page.tsx (Server Component — auth, fetch)
  → _components/feature-view.tsx (pure props → JSX)
```

When data needs preparation, memoization, or composition:

```
page.tsx (Server Component — auth, fetch)
  → _containers/feature-container.tsx (Server Component — transforms, composes)
    → _components/feature-view.tsx (pure props → JSX)
```

When genuine interactivity is needed (forms with state, real-time, browser APIs):

```
page.tsx (Server Component — auth, fetch)
  → _components/feature-view.tsx (Server Component — most of the UI)
    → _containers/edit-form-container.tsx ('use client' — ONLY the interactive leaf)
      → _components/edit-form.tsx (pure props → JSX)
```

Data fetching is ALWAYS in server components (page or server container). `'use client'` is pushed to the smallest possible leaf. Most containers are server components.

## Server Components by Default

Always start with a Server Component. Only add `'use client'` to a `_containers/` file when you genuinely need:
- `useState` / `useReducer` (form state, toggles, selections)
- `useEffect` (subscriptions, timers, browser APIs)
- Event handlers (`onClick`, `onSubmit`, `onChange`)
- Browser APIs (`window`, `document`, `localStorage`)

If none of these apply, keep it as a Server Component in `_components/`.

## The architecture-guard.sh enforces this

Rule 11 in the architecture guard will **block any write** to a `page.tsx` file that contains `'use client'`, React hooks, or raw HTML JSX tags. This is not a suggestion — it is enforced at write-time.
