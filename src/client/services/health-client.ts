import { type HealthResponse, healthResponseSchema } from "@/shared/schemas/health"
import type { Result } from "@/shared/types/result"

export async function fetchHealth(): Promise<Result<HealthResponse>> {
  try {
    const response = await fetch("/api/health", { cache: "no-store" })
    if (!response.ok) return { ok: false, error: `Health check failed (HTTP ${response.status}).` }
    const parsed = healthResponseSchema.safeParse(await response.json())
    return parsed.success
      ? { ok: true, data: parsed.data }
      : { ok: false, error: "Health check returned an unexpected payload." }
  } catch {
    return { ok: false, error: "Health endpoint is unreachable." }
  }
}
