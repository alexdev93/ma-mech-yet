# Architecture

This document describes how the code in `src/` is organised and how the boundaries are enforced. It reflects the code as it is. Update it when the structure changes.

## Architectural boundaries

The code is split into five layers by where it may execute.

| Layer                   | Executes on                                                                                | Guard                                          |
| ----------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `app/`                  | Server by default; `"use client"` route files (such as `error.tsx`) run in the browser too | Next.js conventions                            |
| `server/`               | Server only                                                                                | `import "server-only"` and ESLint              |
| `client/`               | Browser, plus server-side rendering of Client Components                                   | `"use client"` and ESLint                      |
| `shared/`               | Either                                                                                     | ESLint (no server imports, no browser globals) |
| `components/ui`, `lib/` | Either                                                                                     | ESLint (no application imports)                |

The directory name is only a convention. The guarantees come from the `server-only` runtime marker and the lint rules below.

## Dependency direction

```text
            app/  (composition root: routes, layouts, Route Handlers, Server Actions)
          /   |   \
   client/    |    server/
          \   |   /
           shared/
              |
      components/ui, lib/
```

- Arrows point downward only. Lower layers never import higher ones.
- `client/` and `server/` never import each other. They meet in `app/`, where a server page passes data or Server Actions to client components as props.
- Cycles are forbidden everywhere (`import/no-cycle`).

## Module responsibilities

| Module                               | Responsibility                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/**/page.tsx`, `layout.tsx`      | Fetch through services, compose components, set metadata. No business logic                                                                                   |
| `app/**/actions.ts`                  | `"use server"` transport: unwrap `FormData`, delegate to a service                                                                                            |
| `app/api/**/route.ts`                | HTTP transport: status codes, headers, typed JSON                                                                                                             |
| `server/config/env.ts`               | Parse and validate `process.env` once with Zod; the only place that reads env                                                                                 |
| `server/integrations/*`              | Talk to external systems: timeouts, HTTP errors, payload validation; returns `Result<T>`. No caching                                                          |
| `server/services/*`                  | Business rules: validation, mapping to view models, orchestration, and caching (`"use cache"`, `cacheLife`, `cacheTag`)                                       |
| `server/repositories/*` (when added) | Database access only                                                                                                                                          |
| `client/components/*`                | Interactive islands                                                                                                                                           |
| `client/providers/*`                 | `AppProviders` composes every client provider (theme, app store, toaster) for the root layout                                                                 |
| `client/stores/*`                    | Zustand stores. `createStoreContext` gives each provider its own store, and `app-store/` is built from slices. See [state-management.md](state-management.md) |
| `client/services/*`                  | Browser-side calls to Route Handlers, with response validation                                                                                                |
| `shared/schemas/*`                   | Zod schemas, inferred types and pure validation helpers                                                                                                       |
| `shared/types/*`                     | Cross-layer types without a schema (`Result<T>`)                                                                                                              |
| `shared/components/*`                | Presentational components with no hooks and no environment access                                                                                             |
| `components/ui/*`                    | shadcn/ui primitives, kept close to upstream                                                                                                                  |

## Request and data flow

### Server-rendered data (`/examples/server`)

```text
app/examples/server/page.tsx      static header + <Suspense fallback={skeleton}>
  └─ <Posts> (async RSC)
       → server/services/post-service.getLatestPosts()   "use cache", cacheTag("demo-posts")
            → server/integrations/demo-api.fetchDemoPosts()   fetch + 5 s timeout + Zod
                 ├─ success → map to PostSummary, cacheLife("minutes")
                 │            → prerendered into the static shell at build, revalidated in the background
                 └─ failure → { ok: false, error }, cacheLife("seconds")
                              → kept out of the shell, streamed per request, retried soon
       → cards or an error card
```

No JavaScript is sent for the list itself. Caching lives in the service layer, so integrations stay plain and testable, and one service can combine several integrations under one cache entry.

### Mutation via a Server Action (`/examples/client`)

```text
ContactForm (client) ─ onSubmit → validateContact()  ✗ → show field errors, block submit
                                                      ✓ → <form action> (useActionState)
   → app/examples/client/actions.submitContact()          "use server" transport
   → server/services/contact-service.submitContactMessage()  validateContact() again
   → ContactFormState → re-render the form state
```

### Browser call to a Route Handler

```text
HealthStatus (client) → client/services/health-client.fetchHealth()
   → GET /api/health → app/api/health/route.ts   await connection() keeps it per request
   → { status: "ok", timestamp } → healthResponseSchema.safeParse() → Result<HealthResponse>
```

## Testing

Vitest runs in a Node environment. `vitest.config.mts` maps `@/` to `src/` and replaces `server-only` with Next's no-op module.

| Test                                      | Covers                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/schemas/contact.test.ts`          | Valid, invalid and untrusted input to the shared schema                                                                               |
| `server/services/contact-service.test.ts` | Server-side validation in the Server Action path                                                                                      |
| `client/stores/app-store/store.test.ts`   | Each slice's actions, store isolation, reset, the notification cap and the persisted subset                                           |
| `server/services/post-service.test.ts`    | Mapping, cache lifetimes, HTTP errors, invalid payloads, network failures and timeouts. `fetch` is stubbed and `next/cache` is mocked |

Put a new `*.test.ts` next to the module it covers. Test services and schemas directly, and keep route files thin enough that they don't need their own tests.

## Server and client security

- **Secrets stay on the server.** Only `server/config/env.ts` reads `process.env`, and it imports `server-only`, as does everything that uses it. If a Client Component reaches one of these modules, through any chain of imports, the build fails.
- **No `NEXT_PUBLIC_` secrets.** Those values are inlined into browser JavaScript at build time.
- **Server Actions are public endpoints.** Validate the input and authorize the caller inside the action or the service it calls. Never trust the client-side check.
- **Minimal error surfaces.** Integrations log details on the server and return generic messages. `/api/health` exposes nothing about the environment.
- **Serialization boundary.** Props passed from server to client must be serializable and must not contain secrets. Pass the minimum the component needs.
- **Client stores are per request.** Zustand stores are created inside a provider, never at module level, so the server never shares one user's state with another. Persisted store data goes to `localStorage` and must never contain secrets.
- **Never cache per-user data in a shared `"use cache"` function.** Cache entries are shared across requests. Pass user-specific values as arguments only when the result is safe to share for those arguments.
- **Security headers** (CSP, HSTS, frame, referrer and permissions policies) are set in `next.config.ts`. See the README for the CSP trade-off.

## Validation strategy

1. **Trust boundary in, validate.** External APIs, `process.env`, `FormData` and anything the browser receives from the network are `unknown` until a Zod schema parses them.
2. **One schema per contract** lives in `shared/schemas` when both sides use it, or next to its integration when only the server does (`demo-api.ts`).
3. **Types come from schemas** (`z.infer`), so validation and types can't drift apart.
4. **Expected failures are values.** Services return `Result<T>` or a form state instead of throwing, and pages render the failure. Unexpected exceptions reach `app/error.tsx`.

## Adding a feature

Example: an "orders" list with a create form.

1. **Contract:** add `src/shared/schemas/order.ts` with `orderInputSchema`, `type OrderInput` and a form state type.
2. **Data access:** add `src/server/repositories/order-repository.ts` (`import "server-only"`). Add a driver or ORM only now, when it's needed, and read the connection string through `server/config/env.ts`.
3. **Business logic:** add `src/server/services/order-service.ts` (`import "server-only"`). Validate with the shared schema, check authorization and call the repository. Cache shared reads with `"use cache"` and `cacheTag("orders")`, and call `revalidateTag("orders")` after mutations. Add `order-service.test.ts` next to it.
4. **Transport:** add `src/app/orders/actions.ts` (`"use server"`) for UI mutations, and `src/app/api/orders/route.ts` only if external clients need HTTP.
5. **UI:** add `src/app/orders/page.tsx` (Server Component that reads through the service, with request-specific parts inside `<Suspense>`) and, only if it's interactive, `src/client/components/order-form.tsx`, which receives the action as a prop. If unrelated client components need to share browser-only state (for example a cart), add a slice; see [state-management.md](state-management.md#adding-a-slice).
6. **Primitives:** add any missing shadcn/ui pieces with `pnpm dlx shadcn@latest add <name>`.
7. Run `pnpm verify`.

## Enforcing boundaries

| Rule                                        | Tool                                          | Catches                                                                                              |
| ------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `import "server-only"`                      | Next.js bundler                               | Any client bundle that includes a server module, directly or through other imports. Fails the build  |
| `import/no-restricted-paths`                | ESLint (`eslint-plugin-import` + TS resolver) | Imports from forbidden layers, by resolved path, so both `@/` aliases and relative paths are covered |
| `architecture/no-server-in-client`          | ESLint (local rule in `eslint.config.mjs`)    | A `"use client"` module anywhere, including `app/`, importing `@/server/*` or `server-only`          |
| `no-restricted-globals`                     | ESLint, `shared/` only                        | `window`, `document`, `navigator`, `localStorage` and `sessionStorage`                               |
| `no-restricted-imports`                     | ESLint, `shared/` only                        | `server-only`, `client-only`, `next/headers` and `next/navigation`                                   |
| `import/no-cycle`                           | ESLint                                        | Circular dependencies                                                                                |
| `noExplicitAny`, a11y, React and Next rules | Biome                                         | General correctness and style                                                                        |

Biome does all general linting and formatting. ESLint runs only these architecture rules, which Biome can't express (path zones based on resolved imports, cycle detection, directive-aware checks), so the two tools don't overlap.

Use `import "client-only"` in a module that must never run on the server, such as one that touches `localStorage` at import time. Next.js resolves it without an extra dependency, but add the package with `pnpm add client-only` so it resolves explicitly.

### Known limitations

- `no-restricted-globals` doesn't catch indirect access such as `globalThis.window`. Code review and the shared-layer convention cover that.
- `architecture/no-server-in-client` checks import specifiers, not transitive imports. The `server-only` marker is the authoritative transitive guard, so keep it on every sensitive module.
- `server-only` protects modules, not values. Passing a secret as a prop to a Client Component still leaks it.
- `import/no-cycle` slows down linting on very large codebases. Tune it with `maxDepth` if needed.
