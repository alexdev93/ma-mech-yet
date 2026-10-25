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
// Values are trimmed first: a pasted trailing newline in a vault entry would otherwise
// reach Telegram as part of the client credentials.
const text = () => z.string().trim().min(1)
const url = () => z.string().trim().pipe(z.url())

const authEnvSchema = z.object({
  DATABASE_URL: url(),
  TELEGRAM_OIDC_ISSUER: url().default("https://oauth.telegram.org"),
  TELEGRAM_OIDC_CLIENT_ID: text(),
  TELEGRAM_OIDC_CLIENT_SECRET: text(),
  TELEGRAM_OIDC_REDIRECT_URI: url(),
  TELEGRAM_OIDC_SCOPES: text().default("openid profile"),
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
