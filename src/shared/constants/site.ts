import type { Route } from "next"

export const SITE = {
  name: "Next Foundation",
  description: "A type-safe, performance-first Next.js architecture.",
} as const

export const EXAMPLES: ReadonlyArray<{
  href: Route
  title: string
  label: string
  description: string
  kind: "server" | "client" | "state" | "api"
}> = [
  {
    href: "/examples/server",
    title: "Server Component",
    label: "Server",
    description: "Async data fetching, runtime validation and server-only services.",
    kind: "server",
  },
  {
    href: "/examples/client",
    title: "Client Component",
    label: "Client",
    description: "Interactive state, shared Zod validation and a Server Action.",
    kind: "client",
  },
  {
    href: "/examples/state",
    title: "Global state",
    label: "State",
    description: "A modular Zustand store with slices, persistence and notifications.",
    kind: "state",
  },
  {
    href: "/api/health",
    title: "Health endpoint",
    label: "Health",
    description: "A typed Route Handler returning a minimal status payload.",
    kind: "api",
  },
]
