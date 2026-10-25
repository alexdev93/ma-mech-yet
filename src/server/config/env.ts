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
  /** Optional. Enables the "Open the bot" link for users who didn't allow bot messages. */
  TELEGRAM_BOT_USERNAME: z
    .string()
    .trim()
    .transform((value) => value.replace(/^@/, ""))
    .pipe(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{4,31}$/))
    .optional(),
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

// Bot-access events from the bot service (docs/contracts/telegram-otp.v1.md, section 9).
// Optional: without a secret the endpoint answers 503 and logins work as before.
const MIN_SECRET_LENGTH = 32

const botEventsEnvSchema = z.object({
  BOT_EVENTS_CLIENT_ID: text().default("telegram-bot"),
  BOT_EVENTS_SECRET: z.string().trim().min(MIN_SECRET_LENGTH).optional(),
  // Accepted alongside the current secret while a rotation is in progress
  BOT_EVENTS_SECRET_PREVIOUS: z.string().trim().min(MIN_SECRET_LENGTH).optional(),
})

export type BotEventsConfig = { clientId: string; secrets: string[] }

export function getBotEventsConfig(): BotEventsConfig | null {
  // An empty value in the vault means "not set", not "too short"
  const input = Object.fromEntries(
    Object.keys(botEventsEnvSchema.shape).map((key) => [key, process.env[key] || undefined]),
  )
  const result = botEventsEnvSchema.safeParse(input)
  if (!result.success) {
    console.error(`[bot-events] Invalid configuration:\n${z.prettifyError(result.error)}`)
    return null
  }
  const { BOT_EVENTS_CLIENT_ID, BOT_EVENTS_SECRET, BOT_EVENTS_SECRET_PREVIOUS } = result.data
  if (!BOT_EVENTS_SECRET) return null
  return {
    clientId: BOT_EVENTS_CLIENT_ID,
    secrets: [BOT_EVENTS_SECRET, BOT_EVENTS_SECRET_PREVIOUS].filter(
      (secret) => secret !== undefined,
    ),
  }
}
