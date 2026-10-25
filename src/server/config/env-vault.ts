// No "server-only" import: this runs from instrumentation.ts, outside the React Server layer.
import { z } from "zod"

const DEFAULT_URL = "https://env-vault-api.alexdev93.workers.dev"
const TIMEOUT_MS = 5000

const envSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))

/**
 * Loads the vault's variables into process.env when the server starts.
 *
 * Hosts like Vercel run the app in fresh processes, so `envvault run` around the build can't
 * reach them. There, only ENV_VAULT_TOKEN is configured and this fetches the rest at startup.
 * Variables that are already set (by the host or `envvault run`) always win.
 */
export async function loadEnvVault(): Promise<void> {
  const token = process.env.ENV_VAULT_TOKEN
  if (!token) return

  const project = process.env.ENV_VAULT_PROJECT ?? "ma-mech-yet"
  const url = new URL(
    `/api/projects/${encodeURIComponent(project)}/env`,
    process.env.ENV_VAULT_URL ?? DEFAULT_URL,
  )
  url.searchParams.set("branch", process.env.ENV_VAULT_BRANCH ?? "main")

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "next-foundation-env-vault",
        "X-EnvVault-Client": process.env.ENV_VAULT_CLIENT ?? "next-server",
        "X-EnvVault-Command": "run",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) {
      console.error(`[env-vault] Loading variables failed with HTTP ${response.status}`)
      return
    }
    const parsed = envSchema.safeParse(await response.json())
    if (!parsed.success) {
      console.error("[env-vault] Unexpected response shape")
      return
    }
    let loaded = 0
    for (const [key, value] of Object.entries(parsed.data)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue
      process.env[key] = String(value)
      loaded++
    }
    // Only a count: names and values stay out of the logs.
    console.info(`[env-vault] Loaded ${loaded} variables for ${project}`)
  } catch (error) {
    console.error(`[env-vault] Request failed (${error instanceof Error ? error.name : "unknown"})`)
  }
}
