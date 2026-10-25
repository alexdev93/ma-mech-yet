import "server-only"
import { z } from "zod"

const serverEnvSchema = z.object({
  DEMO_API_URL: z.url().default("https://jsonplaceholder.typicode.com"),
})

const parsed = serverEnvSchema.safeParse(process.env)

if (!parsed.success) {
  throw new Error(`Invalid server environment variables:\n${z.prettifyError(parsed.error)}`)
}

export const env = parsed.data

// Auth settings are validated on first use instead of at import, so builds and pages that don't
// touch auth (and CI, which has no secrets) keep working without them.
const authEnvSchema = z.object({
  DATABASE_URL: z.url(),
  TELEGRAM_OIDC_ISSUER: z.url().default("https://oauth.telegram.org"),
  TELEGRAM_OIDC_CLIENT_ID: z.string().min(1),
  TELEGRAM_OIDC_CLIENT_SECRET: z.string().min(1),
  TELEGRAM_OIDC_REDIRECT_URI: z.url(),
  TELEGRAM_OIDC_SCOPES: z.string().min(1).default("openid profile"),
})

export type AuthEnv = z.infer<typeof authEnvSchema>

let authEnv: AuthEnv | undefined

export function getAuthEnv(): AuthEnv {
  if (authEnv) return authEnv
  const result = authEnvSchema.safeParse(process.env)
  if (!result.success) {
    throw new Error(`Invalid auth environment variables:\n${z.prettifyError(result.error)}`)
  }
  authEnv = result.data
  return authEnv
}
