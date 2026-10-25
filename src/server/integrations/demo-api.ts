import "server-only"
import { z } from "zod"

import { env } from "@/server/config/env"
import type { Result } from "@/shared/types/result"

const postSchema = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
})

export type DemoPost = z.infer<typeof postSchema>

const TIMEOUT_MS = 5000

export async function fetchDemoPosts(limit: number): Promise<Result<DemoPost[]>> {
  const url = new URL("/posts", env.DEMO_API_URL)
  url.searchParams.set("_limit", String(limit))

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) {
      console.error(`[demo-api] GET /posts failed with HTTP ${response.status}`)
      return { ok: false, error: `The demo API responded with HTTP ${response.status}.` }
    }
    const parsed = z.array(postSchema).safeParse(await response.json())
    if (!parsed.success) {
      console.error("[demo-api] Unexpected payload", z.prettifyError(parsed.error))
      return { ok: false, error: "The demo API returned an unexpected payload." }
    }
    return { ok: true, data: parsed.data }
  } catch (error) {
    console.error("[demo-api] Request failed", error)
    const timedOut = error instanceof DOMException && error.name === "TimeoutError"
    return {
      ok: false,
      error: timedOut ? "The demo API timed out." : "The demo API is unreachable.",
    }
  }
}
