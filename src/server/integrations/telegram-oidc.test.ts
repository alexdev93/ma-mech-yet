import { createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload, SignJWT } from "jose"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { AuthEnv } from "@/server/config/env"
import {
  buildAuthorizationUrl,
  exchangeCode,
  getDiscovery,
  type OidcDiscovery,
  requestedScopes,
  verifyIdToken,
} from "./telegram-oidc"

const ISSUER = "https://oauth.example.test"
const CLIENT_ID = "1234567"
const NONCE = "nonce-value"

const config: AuthEnv = {
  DATABASE_URL: "postgresql://localhost/test",
  TELEGRAM_OIDC_ISSUER: ISSUER,
  TELEGRAM_OIDC_CLIENT_ID: CLIENT_ID,
  TELEGRAM_OIDC_CLIENT_SECRET: "super-secret-value",
  TELEGRAM_OIDC_REDIRECT_URI: "https://app.example.test/auth/telegram/callback",
  TELEGRAM_OIDC_SCOPES: "openid profile",
}

const discovery: OidcDiscovery = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/auth`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/jwks`,
  code_challenge_methods_supported: ["S256"],
}

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>
let signingKey: KeyPair
let otherKey: KeyPair
let keys: ReturnType<typeof createLocalJWKSet>

beforeAll(async () => {
  signingKey = await generateKeyPair("RS256")
  otherKey = await generateKeyPair("RS256")
  keys = createLocalJWKSet({
    keys: [{ ...(await exportJWK(signingKey.publicKey)), kid: "k1", alg: "RS256" }],
  })
})

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

function sign(claims: JWTPayload, options: { key?: KeyPair; expiresIn?: string | number } = {}) {
  return new SignJWT({ nonce: NONCE, id: 987654321, name: "Ada", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(claims.iss ?? ISSUER)
    .setAudience(claims.aud ?? CLIENT_ID)
    .setSubject(claims.sub ?? "opaque-sub")
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "5m")
    .sign((options.key ?? signingKey).privateKey)
}

const verify = (token: string, nonce = NONCE) =>
  verifyIdToken(token, { keys, issuer: ISSUER, audience: CLIENT_ID, nonce })

describe("verifyIdToken", () => {
  it("accepts a valid token and maps the profile claims", async () => {
    const result = await verify(
      await sign({
        preferred_username: "ada",
        picture: "https://t.me/i/userpic/320/ada.jpg",
        phone_number: "+251911000000",
      }),
    )
    expect(result).toEqual({
      ok: true,
      data: {
        sub: "opaque-sub",
        telegramUserId: "987654321",
        name: "Ada",
        username: "ada",
        pictureUrl: "https://t.me/i/userpic/320/ada.jpg",
        phoneNumber: "+251911000000",
      },
    })
  })

  it("maps absent optional claims to null", async () => {
    const result = await verify(await sign({}))
    expect(result.ok && [result.data.phoneNumber, result.data.pictureUrl]).toEqual([null, null])
  })

  it("rejects a token signed by another key", async () => {
    expect((await verify(await sign({}, { key: otherKey }))).ok).toBe(false)
  })

  it.each([
    ["issuer", { iss: "https://evil.example.test" }],
    ["audience", { aud: "someone-else" }],
  ])("rejects a wrong %s", async (_label, claims) => {
    expect((await verify(await sign(claims))).ok).toBe(false)
  })

  it("rejects a nonce mismatch but accepts a token without one", async () => {
    expect((await verify(await sign({}), "different-nonce")).ok).toBe(false)
    // Telegram's discovery doesn't list `nonce`; the code flow binds the token via state + PKCE.
    expect((await verify(await sign({ nonce: undefined }))).ok).toBe(true)
  })

  it("takes the Telegram ID from a numeric sub when there is no id claim", async () => {
    const result = await verify(await sign({ id: undefined, sub: "987654321" }))
    expect(result.ok && result.data.telegramUserId).toBe("987654321")
    const opaque = await verify(await sign({ id: undefined }))
    expect(opaque.ok && opaque.data.telegramUserId).toBe(null)
  })

  it("drops a malformed profile claim instead of failing the login", async () => {
    const result = await verify(await sign({ picture: "not a url", name: 42 }))
    expect(result.ok && [result.data.pictureUrl, result.data.name]).toEqual([null, null])
  })

  it("logs the reason, algorithm and claim names but no claim values", async () => {
    await verify(await sign({ phone_number: "+251911000000" }, { key: otherKey }))
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls)
    expect(logged).toContain("alg RS256")
    expect(logged).toContain("phone_number")
    expect(logged).not.toContain("+251911000000")
  })

  it("rejects an expired token beyond the clock tolerance", async () => {
    const past = Math.floor(Date.now() / 1000) - 120
    expect((await verify(await sign({}, { expiresIn: past }))).ok).toBe(false)
  })

  it("rejects symmetric and unsigned algorithms", async () => {
    const hs256 = await new SignJWT({ nonce: NONCE })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setSubject("opaque-sub")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(config.TELEGRAM_OIDC_CLIENT_SECRET))
    const result = await verifyIdToken(hs256, {
      keys,
      issuer: ISSUER,
      audience: CLIENT_ID,
      nonce: NONCE,
      algorithms: ["HS256", "none"],
    })
    expect(result.ok).toBe(false)
  })
})

describe("buildAuthorizationUrl", () => {
  it("requests the code flow with PKCE S256, state and nonce", () => {
    const url = buildAuthorizationUrl(discovery, config, {
      state: "s",
      nonce: "n",
      codeChallenge: "c",
    })
    expect(url.origin + url.pathname).toBe(`${ISSUER}/auth`)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: config.TELEGRAM_OIDC_REDIRECT_URI,
      scope: "openid profile phone telegram:bot_access",
      state: "s",
      nonce: "n",
      code_challenge: "c",
      code_challenge_method: "S256",
    })
  })

  it("always requests the required scopes, without duplicates", () => {
    expect(requestedScopes({ ...config, TELEGRAM_OIDC_SCOPES: "openid extra" })).toBe(
      "openid profile phone telegram:bot_access extra",
    )
  })
})

describe("exchangeCode", () => {
  const params = { code: "auth-code", codeVerifier: "verifier" }

  function mockFetch(response: Response | Error) {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      if (response instanceof Error) throw response
      return response
    })
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }

  it("uses client_secret_basic by default and returns the id_token", async () => {
    const fetchMock = mockFetch(Response.json({ id_token: "token", access_token: "ignored" }))

    expect(await exchangeCode(discovery, config, params)).toEqual({
      ok: true,
      data: { idToken: "token", grantedScopes: null },
    })
    const init = fetchMock.mock.calls[0]?.[1]
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from(`${CLIENT_ID}:super-secret-value`).toString("base64")}`,
    )
    const body = init?.body as URLSearchParams
    expect(body.get("code_verifier")).toBe("verifier")
    expect(body.has("client_secret")).toBe(false)
  })

  it("returns the granted scopes when the token response lists them", async () => {
    mockFetch(Response.json({ id_token: "token", scope: "openid profile phone" }))
    const result = await exchangeCode(discovery, config, params)
    expect(result.ok && result.data.grantedScopes).toEqual(["openid", "profile", "phone"])
  })

  it("sends credentials in the body when only client_secret_post is advertised", async () => {
    const fetchMock = mockFetch(Response.json({ id_token: "token" }))
    const postOnly = { ...discovery, token_endpoint_auth_methods_supported: ["client_secret_post"] }

    await exchangeCode(postOnly, config, params)
    const init = fetchMock.mock.calls[0]?.[1] ?? {}
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
    expect((init.body as URLSearchParams).get("client_secret")).toBe("super-secret-value")
  })

  it("fails on HTTP errors, missing id_token and network errors without logging secrets", async () => {
    mockFetch(new Response('{"error":"invalid_grant","code":"auth-code"}', { status: 400 }))
    expect((await exchangeCode(discovery, config, params)).ok).toBe(false)
    mockFetch(Response.json({ access_token: "only" }))
    expect((await exchangeCode(discovery, config, params)).ok).toBe(false)
    mockFetch(new TypeError("fetch failed"))
    expect((await exchangeCode(discovery, config, params)).ok).toBe(false)

    const logged = JSON.stringify(vi.mocked(console.error).mock.calls)
    expect(logged).not.toContain("super-secret-value")
    expect(logged).not.toContain("auth-code")
  })
})

describe("getDiscovery", () => {
  const document = { ...discovery }

  it("rejects a document whose issuer doesn't match the configured one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ...document, issuer: "https://other.example.test" })),
    )
    expect((await getDiscovery(config)).ok).toBe(false)
  })

  it("rejects a provider without PKCE S256", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ ...document, code_challenge_methods_supported: ["plain"] }),
      ),
    )
    expect((await getDiscovery(config)).ok).toBe(false)
  })

  it("loads a valid document from the issuer's well-known URL", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => Response.json(document))
    vi.stubGlobal("fetch", fetchMock)

    const result = await getDiscovery(config)
    expect(result.ok && result.data.discovery.token_endpoint).toBe(`${ISSUER}/token`)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${ISSUER}/.well-known/openid-configuration`)
  })
})
