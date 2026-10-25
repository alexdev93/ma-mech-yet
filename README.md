# Next Foundation

A production-ready Next.js App Router foundation focused on performance, strict type safety and explicit server/client boundaries. It ships with small, working examples of every building block: an async Server Component, Client Component islands, a Server Action with shared Zod validation, a typed Route Handler and a server-only service.

See [docs/architecture.md](docs/architecture.md) for boundaries, data flow and how to add features, and [docs/state-management.md](docs/state-management.md) for the global store.

## 1. Technology stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack for dev and build, Cache Components) |
| UI runtime | React 19.3 with React Compiler (`reactCompiler: true`) |
| Language | TypeScript 6 with strict settings |
| Styling | Tailwind CSS v4 via `@tailwindcss/postcss` |
| Components | shadcn/ui (new-york style, `neutral` base) and Lucide React icons |
| Theming | `next-themes` (light, dark and system) |
| Client state | Zustand 5 (slices, per-request store, persistence, DevTools) |
| Validation | Zod 4 |
| Testing | Vitest (schemas, services, integrations) |
| Lint and format | Biome (general linting and formatting), ESLint (architecture rules only) |
| CI | GitHub Actions running `pnpm verify` |
| Package manager | pnpm |

There is no database, ORM or second component library.

## 2. Prerequisites

- Node.js 20.9 or newer (Node 24 LTS recommended)
- pnpm 10 (`corepack enable` picks up the `packageManager` version)

## 3. Installation

```bash
pnpm install
```

## 4. Environment setup

```bash
cp .env.example .env.local
```

| Variable | Scope | Default | Purpose |
| --- | --- | --- | --- |
| `DEMO_API_URL` | server only | `https://jsonplaceholder.typicode.com` | Public demo API used by `/examples/server` |

- Server variables are validated at startup in `src/server/config/env.ts`. An invalid value fails fast with a message that names the variable but never prints its value.
- Secrets are never prefixed with `NEXT_PUBLIC_`. Anything with that prefix is inlined into the browser bundle.
- `.env.local` and the other `.env*` files are git-ignored. Only `.env.example` is committed.
- **Production:** set variables in your hosting provider's environment settings, not in committed files. Provide them at **build time and at runtime**. With Cache Components, pages are prerendered during `next build`, so cached output (such as the demo posts) is produced with the build-time values and refreshed with the runtime values when the cache revalidates. `NEXT_PUBLIC_*` values are always baked in at build time.

## 5. Development commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server with Turbopack (the Next 16 default) |
| `pnpm check` | Biome lint and format check, then the ESLint architecture rules |
| `pnpm check:fix` | Applies Biome's safe fixes, formatting and import sorting, then ESLint fixes |
| `pnpm lint` | Biome lint plus the ESLint architecture rules, without the format check |
| `pnpm lint:boundaries` | ESLint architecture rules only |
| `pnpm format` | Biome format with writes |
| `pnpm typecheck` | `next typegen` (route types) then `tsc --noEmit` |
| `pnpm test` / `pnpm test:watch` | Vitest, once or in watch mode |
| `pnpm verify` | `check`, then `typecheck`, then `test`, then `build`. CI runs this on every push and pull request |

## 6. Production build and execution

```bash
pnpm build   # next build (Turbopack, the stable default production path in Next 16)
pnpm start   # next start on port 3000
```

To compare against the webpack build: `pnpm exec next build --webpack`.

## 7. Directory structure

```text
src/
├── app/                      # Routes only: pages, layouts, boundaries, Route Handlers, Server Actions
│   ├── api/health/route.ts
│   ├── examples/
│   │   ├── client/{page.tsx,actions.ts}
│   │   ├── server/page.tsx
│   │   └── state/page.tsx
│   ├── error.tsx
│   ├── globals.css
│   ├── icon.svg
│   ├── layout.tsx
│   └── page.tsx
├── client/                   # Browser-only code ("use client")
│   ├── components/           # counter, contact-form, health-status, theme-toggle, toaster, state-demo/
│   ├── providers/            # app-providers (composes all providers), theme-provider
│   ├── services/             # health-client (browser-facing API client)
│   └── stores/               # Zustand: create-store-context, storage, app-store/ (slices)
├── server/                   # Server-only code (import "server-only")
│   ├── config/env.ts         # Zod-validated server environment
│   ├── integrations/demo-api.ts
│   └── services/             # post-service ("use cache"), contact-service, plus *.test.ts
├── shared/                   # Environment-independent code
│   ├── components/page-header.tsx
│   ├── constants/site.ts
│   ├── schemas/              # contact, health (Zod and inferred types), plus *.test.ts
│   └── types/result.ts
├── components/ui/            # shadcn/ui primitives
└── lib/utils.ts              # cn() helper from shadcn/ui
```

Tests sit next to the code they cover (`*.test.ts`). `.github/workflows/ci.yml` holds the CI pipeline. Add folders such as `client/hooks`, `server/repositories`, `server/auth` and `shared/utils` only when the first real module needs one.

## 8. Layer responsibilities

| Layer | Contains | May import |
| --- | --- | --- |
| `app/` | Thin route files that compose layers | everything |
| `client/` | Client Components, hooks, providers, browser API clients | `shared`, `components/ui`, `lib` |
| `server/` | Business logic, data access, integrations, auth, config | `shared`, `lib` |
| `shared/` | Zod schemas, types, constants, pure utils, hook-free components | `shared`, `components/ui`, `lib` |
| `components/ui`, `lib` | Application-agnostic primitives | each other |

ESLint enforces these rules (see [section 17](#17-security-rules) and the architecture doc).

## 9. Server Component or Client Component

Everything is a **Server Component** by default. It renders on the server, can be `async`, can call `server/` services directly, and sends no JavaScript for its own code.

Use a **Client Component** (`"use client"`) only when you need state, effects, event handlers or browser APIs. Keep these components small and render them as islands inside server pages. `/examples/client` is a Server Component page that renders three small client islands.

To give a Client Component server behaviour, pass it data or a Server Action as props. Never import `server/` from it.

## 10. Server Actions or Route Handlers

| Use a **Server Action** when | Use a **Route Handler** when |
| --- | --- |
| A form or mutation comes from your own UI | An external client, webhook or mobile app calls an HTTP endpoint |
| You want progressive enhancement and `useActionState` | You need custom methods, status codes, headers or streaming |

Both are transport layers. Keep them thin and delegate to `server/services`. Server Actions are public HTTP endpoints, so always validate their input and check authorization inside them.

## 11. Shared validation

`src/shared/schemas/contact.ts` defines one Zod schema and infers `ContactInput` from it:

- **Client:** `ContactForm` runs `validateContact()` on submit for instant feedback and stops invalid submissions.
- **Server:** `submitContactMessage()` runs the same function again before doing any work.

Server-side validation is still required because client checks are a convenience, not security. Anyone can call a Server Action or Route Handler directly with arbitrary data and bypass the browser. External data (the demo API, `process.env`, the health response read by the browser) is also parsed with Zod before use.

## Global state (Zustand)

The app store is built from slices (`counter`, `preferences`, `notifications`) and provided once in `AppProviders`. A new store is created for each request, so server renders never share state.

```tsx
"use client"
import { selectNotify, useAppStore } from "@/client/stores/app-store"

const notify = useAppStore(selectNotify)
notify({ title: "Saved", variant: "success" })
```

Use a Zustand slice only for client state that unrelated components share. Server data stays on the server, URL-worthy state goes in search params, and local state stays in `useState`. To add a slice, create one file in `slices/` and register it in `types.ts` and `store.ts`. [docs/state-management.md](docs/state-management.md) has the full guide, including persistence, migrations, DevTools, separate stores and testing. Try it at `/examples/state`.

## 12. Adding shadcn/ui components

```bash
pnpm dlx shadcn@latest add dialog
```

`components.json` points the CLI at `src/components/ui`, `@/lib/utils` and `src/app/globals.css`. Animated primitives such as dialog or dropdown use `tw-animate-css`. If the CLI doesn't add it, run `pnpm add -D tw-animate-css` and add `@import "tw-animate-css";` below `@import "tailwindcss";`. Keep app-specific compositions outside `components/ui`.

## 13. Tailwind CSS

Tailwind v4 is configured CSS-first. There is no `tailwind.config.*`. `postcss.config.mjs` loads `@tailwindcss/postcss`, and the theme tokens live in `globals.css` (`@theme inline`, `:root` and `.dark`). Content detection is automatic. Use the mobile-first responsive variants (`sm:`, `md:`, `lg:`). Merge conditional classes with `cn()`.

**Dark mode:** `next-themes` puts the `dark` class on `<html>` (light, dark or the system preference) before hydration, so there's no flash of the wrong theme. The `dark:` variant then switches the tokens. The toggle (`client/components/theme-toggle.tsx`) renders both icons and lets CSS show the right one, which avoids a hydration mismatch.

## 14. TypeScript conventions

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`, `noImplicitOverride` and `forceConsistentCasingInFileNames` are on.
- No `any`: Biome's `noExplicitAny` is an error. Treat untrusted input as `unknown` and narrow it with Zod.
- Infer types from schemas (`z.infer`) rather than duplicating them.
- Give service and API contracts explicit return types (`Promise<Result<T>>`).
- `typedRoutes` is on, so `<Link href>` is checked against real routes.

## 15. Dependency management

- Add packages with `pnpm add <pkg>` (or `-D` for tooling). Commit `pnpm-lock.yaml`.
- Biome is pinned to an exact version, as Biome recommends. Everything else uses caret ranges.
- Check `pnpm outdated` regularly and upgrade Next.js with `pnpm add next@latest`, then run `pnpm verify`.
- Every new dependency needs a clear purpose. Prefer the platform and existing tools.

## 16. Performance recommendations

- Prefer Server Components and fetch data on the server, close to the source. Move only interactive leaves to the client.
- Cache deliberately with Cache Components (`cacheComponents: true`):
  - `getLatestPosts()` is a `"use cache"` function tagged `demo-posts`. Successful results use `cacheLife("minutes")` and are prerendered into the static shell.
  - Failures use `cacheLife("seconds")`. Next.js leaves short-lived entries out of the shell and streams them per request, so an outage is never frozen into the page.
  - Call `revalidateTag(POSTS_CACHE_TAG)` from a Server Action to refresh on demand.
  - Anything uncached or request-specific must sit inside `<Suspense>`. Route Handlers that must not be prerendered call `await connection()`, as `/api/health` does.
- Wrap slow or dynamic sections in `<Suspense>` with a skeleton fallback. The static parts of the page are then sent immediately.
- The React Compiler memoizes automatically, so don't add `useMemo` or `useCallback` by hand. It runs Babel over files that contain components and hooks, which makes builds slower.
- Use dynamic imports only for heavy, rarely used client code, and measure the effect with the build output.
- System fonts avoid a font download at build time and at runtime. Add `next/font` if you need a brand font.

## 17. Security rules

- Mark every module that reads secrets or does privileged work with `import "server-only"`. Importing such a module from client code fails the build.
- ESLint (`pnpm lint:boundaries`) blocks:
  - `client/`, `shared/`, `components/ui` and `lib` from importing `server/`
  - any `"use client"` file from importing `@/server/*` or `server-only`
  - `shared/` from using `window`, `document`, `navigator`, `localStorage` or `sessionStorage`
  - import cycles
- Never prefix secrets with `NEXT_PUBLIC_`, and never log secret values.
- `/api/health` returns only `{ status, timestamp }`, with no versions, environment or hosts.
- `poweredByHeader` is disabled.
- `next.config.ts` sends security headers on every route:
  - `Content-Security-Policy`
  - `Strict-Transport-Security` (production only)
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
- The CSP is static and allows `'unsafe-inline'` scripts, because Next.js hydration and the `next-themes` script are inline. A nonce-based CSP would remove that allowance, but it forces every page to render dynamically and defeats Cache Components. Development mode adds `'unsafe-eval'` and `ws:` for hot reload. If you load scripts, images or APIs from other origins in the browser, add them to the matching directive.

## 18. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` from pnpm, or from server-side `fetch` | A TLS-inspecting proxy is in the way. Set `NODE_EXTRA_CA_CERTS` to your corporate CA bundle (PEM) before running pnpm or Next |
| `/examples/server` shows "Could not load posts" | Check `DEMO_API_URL` and network access. The server log has a `[demo-api]` line with the cause |
| `Invalid server environment variables` at startup | Fix the variable named in the message in `.env.local` or your host settings |
| `You're importing a module that depends on "server-only"` | Client code imports a server module. Pass data or an action as props instead |
| `Cannot find module 'class-variance-authority'` (or another package) | Run `pnpm install` |
| Biome reports formatting differences | Run `pnpm check:fix` |
| Next warns about multiple lockfiles or the workspace root | `turbopack.root` is pinned in `next.config.ts`. Remove stray lockfiles in parent folders |
| Build error: uncached data was accessed outside of `<Suspense>` | With Cache Components, move the read into a `"use cache"` function or wrap the component in `<Suspense>` |
| The browser console reports a CSP violation | Add the blocked origin to the matching directive in `next.config.ts` |
| `pnpm install --frozen-lockfile` fails in CI | The lockfile is out of date. Run `pnpm install` locally and commit `pnpm-lock.yaml` |

## 19. Production deployment checklist

- [ ] The CI workflow (`.github/workflows/ci.yml`) passes on the default branch
- [ ] Server environment variables are set in the hosting provider for both build and runtime, and none of them is `NEXT_PUBLIC_*`
- [ ] No `.env*` files except `.env.example` are committed
- [ ] Every new server module that touches secrets imports `server-only`
- [ ] Every Server Action and Route Handler validates input and checks authorization
- [ ] Caching or revalidation is set deliberately for each data source
- [ ] Health checks point at `/api/health`
- [ ] The site is served over HTTPS (HSTS with `preload` assumes every subdomain supports HTTPS)
- [ ] The CSP has been reviewed for any third-party origins the app uses
- [ ] Error monitoring and logging are in place, with no secrets in logs
