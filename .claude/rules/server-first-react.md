---
paths:
  - "app/**/*.tsx"
  - "app/**/_containers/**"
  - "app/**/_components/**"
---

# Server-First React

Server Components are the default. Every `.tsx` file is a Server Component unless there is a concrete, unavoidable reason to make it a client component.

## The Decision Tree

Before adding `'use client'` to ANY file, answer these questions in order:

1. **Does this need `useState` or `useReducer`?**
   - Can the state live in the URL instead? → Use `searchParams` in a Server Component
   - Is it form input state? → Use uncontrolled inputs with `<form action={serverAction}>`
   - Is it truly ephemeral UI state (open/closed, hover, selection)? → Yes, you need a client component

2. **Does this need `useEffect`?**
   - Is it fetching data on mount? → Fetch in the Server Component and pass as props. NEVER `useEffect` for data fetching.
   - Is it a genuine browser-side effect (resize listener, intersection observer, timer)? → Yes, you need a client component

3. **Does this need an event handler (`onClick`, `onChange`, etc.)?**
   - Is it a form submission? → Use `<form action={serverAction}>` — no `onClick` needed
   - Is it navigation? → Use `<Link>` or `redirect()` in a server action
   - Is it truly interactive (toggle, drag, animation trigger)? → Yes, you need a client component

4. **Does this need browser APIs (`window`, `document`, `localStorage`)?**
   - Yes → Client component

**If you answered "no" to all four, it MUST be a Server Component.**

## The Minimum Client Surface Principle

**If something CAN be done as a Server Component, it MUST be done as a Server Component.**

When a feature contains both server-possible and client-necessary behavior, you MUST decompose it into separate components. The server-possible parts stay as Server Components. Only the genuinely client-necessary part becomes a client component — the smallest possible leaf.

**Never bundle server-possible work with client-necessary work in a single `'use client'` file.**

### Example: API Key Management

A feature has two operations: "Create Key" (needs client state for one-time key reveal) and "Revoke Key" (plain form → server action).

```tsx
// ❌ WRONG — everything is client because one part needs it
'use client';
export function ApiKeysContainer() {
  const [createdKey, setCreatedKey] = useState(null);  // genuinely needs client
  const [revokeId, setRevokeId] = useState('');         // does NOT need client
  const [revokeError, setRevokeError] = useState(null); // does NOT need client

  // ... handlers for both ...
  return <ApiKeysView /* ... all props */ />;
}
```

```tsx
// ✅ CORRECT — decomposed by client necessity
// _components/api-keys-page-view.tsx (Server Component — composes both)
import { RevokeKeyForm } from './revoke-key-form';
import { CreateKeyContainer } from '../_containers/create-key-container';

export function ApiKeysPageView() {
  return (
    <>
      <CreateKeyContainer />   {/* client — needs state for key reveal */}
      <RevokeKeyForm />         {/* server — plain form, no client state */}
    </>
  );
}

// _components/revoke-key-form.tsx (Server Component — uncontrolled form)
import { revokeApiKeyAction } from '../actions';

export function RevokeKeyForm() {
  return (
    <form action={revokeApiKeyAction}>
      <input name="credentialId" placeholder="cred_…" />
      <button type="submit">Revoke Key</button>
    </form>
  );
}

// _containers/create-key-container.tsx ('use client' — ONLY what needs it)
'use client';
import { useState } from 'react';
import { createApiKeyAction } from '../actions';
import { KeyReveal } from '../_components/key-reveal';

export function CreateKeyContainer() {
  const [createdKey, setCreatedKey] = useState(null);
  const [creating, setCreating] = useState(false);
  // ... only the create handler ...
  return <KeyReveal createdKey={createdKey} creating={creating} onCreate={handleCreate} />;
}
```

### The decomposition test

Before writing ANY client container, ask: **"Does every piece of this container genuinely need client state?"**

If the answer is no — if even one form, one section, or one button could work as a server component with `<form action={...}>` — then decompose. Extract the server-possible parts into `_components/` as Server Components. The client container shrinks to only the irreducible interactive core.

## Where `'use client'` is Allowed

`'use client'` is ONLY permitted in two places:

| Location | Purpose |
|----------|---------|
| `_containers/*.tsx` | ONLY when the container genuinely needs client interactivity (state, hooks, browser APIs) |
| `error.tsx` | Next.js error boundaries (framework requirement) |

The architecture guard (Rule 12) will **block** `'use client'` anywhere else.

**Containers do NOT require `'use client'`.** Most containers should be server components that fetch and prepare data. Only add `'use client'` when the container manages genuinely interactive state (form inputs, toggles, animations, browser APIs).

## The Anti-Patterns

### 1. useEffect for Data Fetching (most common violation)

```tsx
// ❌ WRONG — client-side data fetching
'use client';
import { useEffect, useState } from 'react';
import { getDataAction } from '../actions';

export function DataContainer() {
  const [data, setData] = useState(null);
  useEffect(() => {
    getDataAction().then(setData);
  }, []);
  return data ? <DataView data={data} /> : <p>Loading...</p>;
}
```

```tsx
// ✅ CORRECT — server-side data fetching in page.tsx
import { getData } from '@/modules/mymodule';
import { DataView } from './_components/data-view';

export default async function Page() {
  const data = await getData();
  return <DataView data={data} />;
}
```

### 2. useState for Every Form Field

```tsx
// ❌ WRONG — controlled form with client state
'use client';
import { useState } from 'react';

export function FormContainer() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    await createAction({ name, email });
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={e => setName(e.target.value)} />
      <input value={email} onChange={e => setEmail(e.target.value)} />
      <button type="submit">Create</button>
    </form>
  );
}
```

```tsx
// ✅ CORRECT — uncontrolled form with server action
// This can be a Server Component — no 'use client' needed!
import { createAction } from '../actions';

export function CreateForm() {
  return (
    <form action={createAction}>
      <input name="name" />
      <input name="email" />
      <button type="submit">Create</button>
    </form>
  );
}
```

### 3. useRouter for Post-Mutation Navigation

```tsx
// ❌ WRONG — client-side navigation after mutation
'use client';
import { useRouter } from 'next/navigation';

export function Container() {
  const router = useRouter();
  async function handleSubmit(formData) {
    const result = await createAction(formData);
    if (result.success) router.push('/dashboard');
  }
  // ...
}
```

```tsx
// ✅ CORRECT — redirect in the server action
// actions.ts
'use server';
import { redirect } from 'next/navigation';

export async function createAction(formData: FormData) {
  const result = await create({ ... });
  if (result.success) redirect('/dashboard');
  return { success: false, error: result.error.message };
}
```

## When Client Components ARE Correct

**Data fetching is NEVER a reason for a client component.** If you need data, fetch it in a Server Component (page.tsx or a server container) and pass it as props. There is no valid reason to use `useEffect` or the `use()` hook for data fetching in this project.

These patterns genuinely need `'use client'` in a `_containers/` file:

- **Optimistic UI** — `useOptimistic` for instant feedback before server confirms
- **Real-time updates** — WebSocket subscriptions, SSE listeners
- **Complex form interactions** — multi-step wizards, dependent dropdowns, drag-and-drop
- **Animations** — framer-motion, CSS transition orchestration
- **Browser APIs** — clipboard, geolocation, media devices, canvas
- **Third-party client libraries** — maps, charts, rich text editors

## Push the Boundary Down — The Decomposition Rule

When a page needs interactivity, don't make the entire view a client component. Decompose by client necessity:

```
// ❌ WRONG — one client container owns everything
page.tsx → _containers/feature-container.tsx ('use client', 200 lines, bundles server-possible with client-necessary)

// ❌ STILL WRONG — client container is slim but still bundles server-possible forms
page.tsx → _containers/feature-container.tsx ('use client', all state including forms that don't need it)
             → _components/feature-view.tsx (all JSX)

// ✅ CORRECT — decomposed by client necessity
page.tsx (Server Component, fetches data)
  → _components/feature-view.tsx (Server Component, composes the page)
    → _components/search-form.tsx (Server Component — uncontrolled form + server action)
    → _components/data-table.tsx (Server Component — pure data display)
    → _containers/inline-edit.tsx ('use client', 20 lines — ONLY the interactive leaf)
```

**The rule is not "make containers slim." The rule is "make the client surface minimum."**

Every `useState`, every `useEffect`, every `'use client'` directive is JavaScript shipped to the browser. The question is never "is this container clean?" — it's **"does this NEED to be in the client bundle at all?"**

The less JavaScript shipped to the browser, the better.
