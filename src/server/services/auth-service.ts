import "server-only"

import { pkceChallenge, randomToken, safeEqual, sha256 } from "@/server/auth/crypto"
import { getAuthEnv } from "@/server/config/env"
import {
  BOT_ACCESS_SCOPE,
  buildAuthorizationUrl,
  exchangeCode,
  getDiscovery,
  verifyIdToken,
} from "@/server/integrations/telegram-oidc"
import {
  type ConsumedLoginAttempt,
  consumeLoginAttempt,
  createLoginAttempt,
  createSession,
  deleteSession,
  findSessionUser,
  recordLoginOutcome,
  type SessionUser,
  upsertTelegramIdentity,
} from "@/server/repositories/auth-repository"
import type { Result } from "@/shared/types/result"

export const LOGIN_ATTEMPT_TTL_MS = 10 * 60 * 1000
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_RETURN_TO = "/account"

/**
 * Error codes shown on the login page. They never reveal which security check failed.
 * "phone" / "bot" / "permissions": the user signed in but withheld the phone number,
 * bot messaging, or both. Saying which one tells them exactly what to allow next time.
 */
export type LoginError =
  | "unavailable"
  | "denied"
  | "failed"
  | "expired"
  | "phone"
  | "bot"
  | "permissions"

export async function startLogin(
  returnTo?: string | null,
): Promise<Result<{ url: URL; state: string }, LoginError>> {
  const config = getAuthEnv()
  const provider = await getDiscovery(config)
  if (!provider.ok) return { ok: false, error: "unavailable" }

  const state = randomToken()
  const nonce = randomToken()
  const codeVerifier = randomToken()
  await createLoginAttempt({
    stateHash: sha256(state),
    nonce,
    codeVerifier,
    returnTo: safeReturnTo(returnTo),
    expiresAt: new Date(Date.now() + LOGIN_ATTEMPT_TTL_MS),
  })
  const url = buildAuthorizationUrl(provider.data.discovery, config, {
    state,
    nonce,
    codeChallenge: pkceChallenge(codeVerifier),
  })
  return { ok: true, data: { url, state } }
}

export type CallbackParams = {
  code: string | null
  state: string | null
  error: string | null
  /** The state stored in this browser's login cookie when the flow started. */
  stateCookie: string | null
}

export async function completeLogin(
  params: CallbackParams,
): Promise<Result<{ sessionToken: string; expiresAt: Date; returnTo: string }, LoginError>> {
  const { code, state, error, stateCookie } = params
  // The state must come back to the same browser that started the flow (login CSRF protection).
  if (!state || !stateCookie || !safeEqual(state, stateCookie)) {
    console.warn(
      `[auth] Callback rejected: ${!stateCookie ? "no login cookie (different browser or expired)" : "state mismatch"}`,
    )
    return { ok: false, error: "expired" }
  }

  // Consume first, so the attempt can't be reused whatever happens next.
  const stateHash = sha256(state)
  const attempt = await consumeLoginAttempt(stateHash)
  if (!attempt) {
    console.warn("[auth] Callback rejected: login attempt unknown, expired or already used")
    return { ok: false, error: "expired" }
  }

  const { result, outcome } = await finishLogin(attempt, code, error)
  if (!result.ok) console.warn(`[auth] Login failed: ${outcome}`)
  // Best effort: failing to record the outcome must not change the login result.
  await recordLoginOutcome(stateHash, outcome).catch((cause: unknown) =>
    console.error("[auth] Could not record login outcome", cause),
  )
  return result
}

type LoginResult = Result<{ sessionToken: string; expiresAt: Date; returnTo: string }, LoginError>

async function finishLogin(
  attempt: ConsumedLoginAttempt,
  code: string | null,
  error: string | null,
): Promise<{ result: LoginResult; outcome: string }> {
  const fail = (loginError: LoginError, outcome: string) => ({
    result: { ok: false, error: loginError } as const,
    outcome,
  })
  // `error` is a short OAuth code such as access_denied; never a secret.
  if (error) {
    return fail(error === "access_denied" ? "denied" : "failed", `telegram:${error.slice(0, 40)}`)
  }
  if (!code) return fail("failed", "no_code")

  const config = getAuthEnv()
  const provider = await getDiscovery(config)
  if (!provider.ok) return fail("unavailable", "discovery_unavailable")
  const { discovery, keys } = provider.data

  const token = await exchangeCode(discovery, config, { code, codeVerifier: attempt.codeVerifier })
  if (!token.ok) return fail("failed", "token_exchange_failed")

  const profile = await verifyIdToken(token.data.idToken, {
    keys,
    issuer: discovery.issuer,
    audience: config.TELEGRAM_OIDC_CLIENT_ID,
    nonce: attempt.nonce,
    algorithms: discovery.id_token_signing_alg_values_supported,
  })
  if (!profile.ok) return fail("failed", "id_token_invalid")

  // Both are required. Checked before anything is stored, so a refusal leaves no record.
  // RFC 6749 §5.1: an omitted `scope` means everything requested was granted.
  const { grantedScopes } = token.data
  const botAccessGranted = grantedScopes === null || grantedScopes.includes(BOT_ACCESS_SCOPE)
  const hasPhone = profile.data.phoneNumber !== null
  if (!hasPhone || !botAccessGranted) {
    const missing = [!hasPhone && "phone", !botAccessGranted && "bot_access"].filter(Boolean)
    const loginError = !hasPhone && !botAccessGranted ? "permissions" : !hasPhone ? "phone" : "bot"
    return fail(loginError, `missing:${missing.join(",")}`)
  }

  // Every sign-in refreshes the stored profile from Telegram's latest data.
  const userId = await upsertTelegramIdentity(profile.data, botAccessGranted)
  const sessionToken = randomToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await createSession({ tokenHash: sha256(sessionToken), userId, expiresAt })
  return {
    result: { ok: true, data: { sessionToken, expiresAt, returnTo: attempt.returnTo } },
    outcome: "success",
  }
}

export async function getSessionUser(sessionToken: string): Promise<SessionUser | null> {
  return findSessionUser(sha256(sessionToken))
}

export async function logout(sessionToken: string): Promise<void> {
  await deleteSession(sha256(sessionToken))
}

/** Only same-site absolute paths, so the callback can't be turned into an open redirect. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return DEFAULT_RETURN_TO
  }
  return value
}
