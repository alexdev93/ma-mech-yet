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
  countActiveSessions,
  countRecentLoginAttempts,
  createLoginAttempt,
  createSession,
  deleteSession,
  deleteUser,
  deleteUserSessions,
  findSessionUser,
  recordLoginOutcome,
  type SessionUser,
  upsertTelegramIdentity,
} from "@/server/repositories/auth-repository"
import type { Result } from "@/shared/types/result"

export const LOGIN_ATTEMPT_TTL_MS = 10 * 60 * 1000
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_RETURN_TO = "/account"
// Generous for people retrying, tight enough to stop one client flooding login_attempts.
export const LOGIN_RATE_LIMIT = { max: 20, windowMs: 10 * 60 * 1000 }

/** Error codes shown on the login page. They never reveal which security check failed. */
export type LoginError = "unavailable" | "denied" | "failed" | "expired" | "rate_limited"

export async function startLogin(
  returnTo?: string | null,
  clientIp?: string | null,
): Promise<Result<{ url: URL; state: string }, LoginError>> {
  // Hashed so the table never holds IP addresses; a hash is enough to count attempts.
  const ipHash = clientIp ? sha256(clientIp) : null
  if (ipHash) {
    const since = new Date(Date.now() - LOGIN_RATE_LIMIT.windowMs)
    if ((await countRecentLoginAttempts(ipHash, since)) >= LOGIN_RATE_LIMIT.max) {
      console.warn("[auth] Login start rate-limited")
      return { ok: false, error: "rate_limited" }
    }
  }

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
    ipHash,
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
  /** A session this browser already had. Replaced on success so sessions don't pile up. */
  previousSessionToken?: string | null
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
  if (result.ok && params.previousSessionToken) {
    await deleteSession(sha256(params.previousSessionToken)).catch((cause: unknown) =>
      console.error("[auth] Could not remove the previous session", cause),
    )
  }
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

  // Phone and bot messaging are requested but optional: declining either still signs the user in.
  // RFC 6749 §5.1: an omitted `scope` means everything requested was granted.
  const { grantedScopes } = token.data
  const botAccessGranted = grantedScopes === null || grantedScopes.includes(BOT_ACCESS_SCOPE)
  const declined = [
    profile.data.phoneNumber === null && "phone",
    !botAccessGranted && "bot_access",
  ].filter(Boolean)

  // Every sign-in refreshes the stored profile from Telegram's latest data.
  const userId = await upsertTelegramIdentity(profile.data, botAccessGranted)
  const sessionToken = randomToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await createSession({ tokenHash: sha256(sessionToken), userId, expiresAt })
  return {
    result: { ok: true, data: { sessionToken, expiresAt, returnTo: attempt.returnTo } },
    outcome: declined.length ? `success:declined:${declined.join(",")}` : "success",
  }
}

export async function getSessionUser(sessionToken: string): Promise<SessionUser | null> {
  return findSessionUser(sha256(sessionToken))
}

export async function logout(sessionToken: string): Promise<void> {
  await deleteSession(sha256(sessionToken))
}

/** Signs the user out on every device, including this one. */
export async function logoutEverywhere(sessionToken: string): Promise<void> {
  const user = await findSessionUser(sha256(sessionToken))
  if (user) await deleteUserSessions(user.userId)
}

/** Permanently deletes the signed-in user's account and everything linked to it. */
export async function deleteAccount(sessionToken: string): Promise<boolean> {
  const user = await findSessionUser(sha256(sessionToken))
  if (!user) return false
  await deleteUser(user.userId)
  console.info("[auth] Account deleted")
  return true
}

export async function getActiveSessionCount(userId: string): Promise<number> {
  return countActiveSessions(userId)
}

/** Only same-site absolute paths, so the callback can't be turned into an open redirect. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return DEFAULT_RETURN_TO
  }
  return value
}
