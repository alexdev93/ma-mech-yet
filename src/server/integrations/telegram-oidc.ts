import "server-only"
import {
  createRemoteJWKSet,
  type JWTVerifyGetKey,
  type JWTVerifyOptions,
  errors as joseErrors,
  jwtVerify,
} from "jose"
import { z } from "zod"

import { type AuthEnv, getAuthEnv } from "@/server/config/env"
import type { Result } from "@/shared/types/result"

const TIMEOUT_MS = 5000
const DISCOVERY_TTL_MS = 60 * 60 * 1000
const CLOCK_TOLERANCE_SECONDS = 30
// Only asymmetric algorithms: a symmetric one would let anyone holding the client secret mint tokens.
const ALLOWED_ALGORITHMS = ["RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "EdDSA"]

const discoverySchema = z.object({
  issuer: z.url(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  jwks_uri: z.url(),
  id_token_signing_alg_values_supported: z.array(z.string()).optional(),
  token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
  code_challenge_methods_supported: z.array(z.string()).optional(),
})

export type OidcDiscovery = z.infer<typeof discoverySchema>

export const BOT_ACCESS_SCOPE = "telegram:bot_access"
/**
 * Always requested, on top of TELEGRAM_OIDC_SCOPES. `phone` adds the `phone_number` claim;
 * `telegram:bot_access` lets the bot message the user but adds no claim to the ID token.
 */
export const REQUIRED_SCOPES = ["openid", "profile", "phone", BOT_ACCESS_SCOPE] as const

const tokenResponseSchema = z.object({
  id_token: z.string().min(1),
  // RFC 6749: the granted scopes, when they may differ from the requested ones.
  scope: z.string().optional(),
})

export type TokenResult = { idToken: string; grantedScopes: string[] | null }

const idTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  id: z.union([z.number().int(), z.string().regex(/^\d+$/)]).optional(),
  name: z.string().optional(),
  preferred_username: z.string().optional(),
  picture: z.url().optional(),
  phone_number: z.string().min(1).optional(),
})

export type TelegramProfile = {
  sub: string
  telegramUserId: string | null
  name: string | null
  username: string | null
  pictureUrl: string | null
  phoneNumber: string | null
}

export function requestedScopes(config: AuthEnv): string {
  return [...new Set([...REQUIRED_SCOPES, ...config.TELEGRAM_OIDC_SCOPES.split(/\s+/)])].join(" ")
}

type Discovered = { discovery: OidcDiscovery; keys: JWTVerifyGetKey; fetchedAt: number }
let discovered: Discovered | undefined

/** Loads and caches the provider metadata. The issuer it reports must match the configured one. */
export async function getDiscovery(config: AuthEnv = getAuthEnv()): Promise<Result<Discovered>> {
  if (discovered && Date.now() - discovered.fetchedAt < DISCOVERY_TTL_MS) {
    return { ok: true, data: discovered }
  }
  const url = new URL(
    ".well-known/openid-configuration",
    withTrailingSlash(config.TELEGRAM_OIDC_ISSUER),
  )
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) {
      console.error(`[telegram-oidc] Discovery failed with HTTP ${response.status}`)
      return { ok: false, error: "Telegram login is unavailable." }
    }
    const parsed = discoverySchema.safeParse(await response.json())
    if (!parsed.success) {
      console.error("[telegram-oidc] Unexpected discovery document", z.prettifyError(parsed.error))
      return { ok: false, error: "Telegram login is unavailable." }
    }
    if (stripSlash(parsed.data.issuer) !== stripSlash(config.TELEGRAM_OIDC_ISSUER)) {
      console.error("[telegram-oidc] Discovery issuer does not match TELEGRAM_OIDC_ISSUER")
      return { ok: false, error: "Telegram login is unavailable." }
    }
    const methods = parsed.data.code_challenge_methods_supported
    if (methods && !methods.includes("S256")) {
      console.error("[telegram-oidc] Provider does not support PKCE S256")
      return { ok: false, error: "Telegram login is unavailable." }
    }
    discovered = {
      discovery: parsed.data,
      keys: createRemoteJWKSet(new URL(parsed.data.jwks_uri), { timeoutDuration: TIMEOUT_MS }),
      fetchedAt: Date.now(),
    }
    return { ok: true, data: discovered }
  } catch (error) {
    console.error("[telegram-oidc] Discovery request failed", error)
    return { ok: false, error: "Telegram login is unavailable." }
  }
}

export function buildAuthorizationUrl(
  discovery: OidcDiscovery,
  config: AuthEnv,
  params: { state: string; nonce: string; codeChallenge: string },
): URL {
  const url = new URL(discovery.authorization_endpoint)
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.TELEGRAM_OIDC_CLIENT_ID,
    redirect_uri: config.TELEGRAM_OIDC_REDIRECT_URI,
    scope: requestedScopes(config),
    state: params.state,
    nonce: params.nonce,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
  }).toString()
  return url
}

/** Exchanges the authorization code. Client authentication follows what discovery advertises. */
export async function exchangeCode(
  discovery: OidcDiscovery,
  config: AuthEnv,
  params: { code: string; codeVerifier: string },
): Promise<Result<TokenResult>> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: config.TELEGRAM_OIDC_REDIRECT_URI,
    code_verifier: params.codeVerifier,
  })
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  }
  // OIDC Discovery: client_secret_basic is the default when the provider doesn't list methods.
  const methods = discovery.token_endpoint_auth_methods_supported ?? ["client_secret_basic"]
  if (methods.includes("client_secret_basic")) {
    const id = encodeURIComponent(config.TELEGRAM_OIDC_CLIENT_ID)
    const secret = encodeURIComponent(config.TELEGRAM_OIDC_CLIENT_SECRET)
    headers.Authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`
  } else if (methods.includes("client_secret_post")) {
    body.set("client_id", config.TELEGRAM_OIDC_CLIENT_ID)
    body.set("client_secret", config.TELEGRAM_OIDC_CLIENT_SECRET)
  } else {
    console.error("[telegram-oidc] No supported token endpoint auth method", methods)
    return { ok: false, error: "Telegram login is unavailable." }
  }

  try {
    const response = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) {
      // The body may echo request details, so only the status is logged.
      console.error(`[telegram-oidc] Token exchange failed with HTTP ${response.status}`)
      return { ok: false, error: "Telegram login failed." }
    }
    const parsed = tokenResponseSchema.safeParse(await response.json())
    if (!parsed.success) {
      console.error("[telegram-oidc] Token response has no id_token")
      return { ok: false, error: "Telegram login failed." }
    }
    const { id_token, scope } = parsed.data
    return {
      ok: true,
      data: { idToken: id_token, grantedScopes: scope === undefined ? null : scope.split(/\s+/) },
    }
  } catch (error) {
    console.error("[telegram-oidc] Token request failed", error)
    return { ok: false, error: "Telegram login failed." }
  }
}

/** Verifies signature, issuer, audience, lifetime and nonce, then maps the claims we keep. */
export async function verifyIdToken(
  idToken: string,
  options: {
    keys: JWTVerifyGetKey
    issuer: string
    audience: string
    nonce: string
    algorithms?: string[] | undefined
  },
): Promise<Result<TelegramProfile>> {
  const algorithms = (options.algorithms ?? ["RS256"]).filter((alg) =>
    ALLOWED_ALGORITHMS.includes(alg),
  )
  const verifyOptions: JWTVerifyOptions = {
    issuer: [stripSlash(options.issuer), withTrailingSlash(options.issuer)],
    audience: options.audience,
    algorithms,
    clockTolerance: CLOCK_TOLERANCE_SECONDS,
    requiredClaims: ["sub", "exp", "iat"],
  }
  try {
    const { payload } = await jwtVerify(idToken, options.keys, verifyOptions)
    if (typeof payload.nonce !== "string" || payload.nonce !== options.nonce) {
      console.error("[telegram-oidc] ID token nonce mismatch")
      return { ok: false, error: "Telegram login failed." }
    }
    const claims = idTokenClaimsSchema.safeParse(payload)
    if (!claims.success) {
      console.error("[telegram-oidc] Unexpected ID token claims", z.prettifyError(claims.error))
      return { ok: false, error: "Telegram login failed." }
    }
    const { sub, id, name, preferred_username, picture, phone_number } = claims.data
    return {
      ok: true,
      data: {
        sub,
        telegramUserId: id === undefined ? null : String(id),
        name: name ?? null,
        username: preferred_username ?? null,
        pictureUrl: picture ?? null,
        phoneNumber: phone_number ?? null,
      },
    }
  } catch (error) {
    // jose error codes say what failed without including the token.
    const code = error instanceof joseErrors.JOSEError ? error.code : "ERR_UNKNOWN"
    console.error(`[telegram-oidc] ID token rejected (${code})`)
    return { ok: false, error: "Telegram login failed." }
  }
}

function stripSlash(url: string): string {
  return url.replace(/\/+$/, "")
}

function withTrailingSlash(url: string): string {
  return `${stripSlash(url)}/`
}
