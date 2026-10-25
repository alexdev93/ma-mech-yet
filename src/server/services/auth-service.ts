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
  consumeLoginAttempt,
  createLoginAttempt,
  createSession,
  deleteSession,
  findSessionUser,
  type SessionUser,
  upsertTelegramIdentity,
} from "@/server/repositories/auth-repository"
import type { Result } from "@/shared/types/result"

export const LOGIN_ATTEMPT_TTL_MS = 10 * 60 * 1000
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_RETURN_TO = "/account"

/**
 * Error codes shown on the login page. They never reveal which security check failed.
 * "permissions": the user signed in but withheld the phone number or bot messaging.
 */
export type LoginError = "unavailable" | "denied" | "failed" | "expired" | "permissions"

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
  if (!state || !stateCookie || !safeEqual(state, stateCookie))
    return { ok: false, error: "expired" }

  // Consume first, so the attempt can't be reused whatever happens next.
  const attempt = await consumeLoginAttempt(sha256(state))
  if (!attempt) return { ok: false, error: "expired" }
  if (error) return { ok: false, error: error === "access_denied" ? "denied" : "failed" }
  if (!code) return { ok: false, error: "failed" }

  const config = getAuthEnv()
  const provider = await getDiscovery(config)
  if (!provider.ok) return { ok: false, error: "unavailable" }
  const { discovery, keys } = provider.data

  const token = await exchangeCode(discovery, config, {
    code,
    codeVerifier: attempt.codeVerifier,
  })
  if (!token.ok) return { ok: false, error: "failed" }

  const profile = await verifyIdToken(token.data.idToken, {
    keys,
    issuer: discovery.issuer,
    audience: config.TELEGRAM_OIDC_CLIENT_ID,
    nonce: attempt.nonce,
    algorithms: discovery.id_token_signing_alg_values_supported,
  })
  if (!profile.ok) return { ok: false, error: "failed" }

  // Both are required. Checked before anything is stored, so a refusal leaves no record.
  // RFC 6749 §5.1: an omitted `scope` means everything requested was granted.
  const { grantedScopes } = token.data
  const botAccessGranted = grantedScopes === null || grantedScopes.includes(BOT_ACCESS_SCOPE)
  if (!profile.data.phoneNumber || !botAccessGranted) return { ok: false, error: "permissions" }

  const userId = await upsertTelegramIdentity(profile.data, botAccessGranted)
  const sessionToken = randomToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await createSession({ tokenHash: sha256(sessionToken), userId, expiresAt })
  return { ok: true, data: { sessionToken, expiresAt, returnTo: attempt.returnTo } }
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
