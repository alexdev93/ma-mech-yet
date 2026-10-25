import { beforeEach, describe, expect, it, vi } from "vitest"

import { pkceChallenge, sha256 } from "@/server/auth/crypto"
import * as oidc from "@/server/integrations/telegram-oidc"
import * as repository from "@/server/repositories/auth-repository"
import { type CallbackParams, completeLogin, safeReturnTo, startLogin } from "./auth-service"

vi.mock("@/server/config/env", () => ({
  getAuthEnv: () => ({
    DATABASE_URL: "postgresql://localhost/test",
    TELEGRAM_OIDC_ISSUER: "https://oauth.example.test",
    TELEGRAM_OIDC_CLIENT_ID: "1234567",
    TELEGRAM_OIDC_CLIENT_SECRET: "secret",
    TELEGRAM_OIDC_REDIRECT_URI: "https://app.example.test/auth/telegram/callback",
    TELEGRAM_OIDC_SCOPES: "openid profile",
  }),
}))
vi.mock("@/server/repositories/auth-repository", () => ({
  createLoginAttempt: vi.fn(),
  consumeLoginAttempt: vi.fn(),
  upsertTelegramIdentity: vi.fn(),
  createSession: vi.fn(),
  findSessionUser: vi.fn(),
  deleteSession: vi.fn(),
}))
vi.mock("@/server/integrations/telegram-oidc", async (importOriginal) => ({
  ...(await importOriginal<typeof oidc>()),
  getDiscovery: vi.fn(),
  exchangeCode: vi.fn(),
  verifyIdToken: vi.fn(),
}))

const discovery: oidc.OidcDiscovery = {
  issuer: "https://oauth.example.test",
  authorization_endpoint: "https://oauth.example.test/auth",
  token_endpoint: "https://oauth.example.test/token",
  jwks_uri: "https://oauth.example.test/jwks",
}
const profile: oidc.TelegramProfile = {
  sub: "opaque-sub",
  telegramUserId: "987654321",
  name: "Ada",
  username: "ada",
  pictureUrl: null,
  phoneNumber: "+251911000000",
}
const attempt = { nonce: "nonce", codeVerifier: "verifier", returnTo: "/account" }

const callback = (overrides: Partial<CallbackParams> = {}): CallbackParams => ({
  code: "auth-code",
  state: "state-value",
  error: null,
  stateCookie: "state-value",
  ...overrides,
})

beforeEach(() => {
  vi.mocked(oidc.getDiscovery).mockResolvedValue({
    ok: true,
    data: { discovery, keys: vi.fn(), fetchedAt: Date.now() },
  })
  vi.mocked(oidc.exchangeCode).mockResolvedValue({
    ok: true,
    data: { idToken: "id-token", grantedScopes: null },
  })
  vi.mocked(oidc.verifyIdToken).mockResolvedValue({ ok: true, data: profile })
  vi.mocked(repository.consumeLoginAttempt).mockResolvedValue(attempt)
  vi.mocked(repository.upsertTelegramIdentity).mockResolvedValue("user-1")
})

describe("startLogin", () => {
  it("stores only the state hash and sends the matching PKCE challenge", async () => {
    const result = await startLogin("//evil.example.test")
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const stored = vi.mocked(repository.createLoginAttempt).mock.calls[0]?.[0]
    expect(stored?.stateHash).toBe(sha256(result.data.state))
    expect(stored?.returnTo).toBe("/account")
    const query = result.data.url.searchParams
    expect(query.get("state")).toBe(result.data.state)
    expect(query.get("nonce")).toBe(stored?.nonce)
    expect(query.get("code_challenge")).toBe(pkceChallenge(stored?.codeVerifier ?? ""))
  })

  it("reports unavailable when discovery fails", async () => {
    vi.mocked(oidc.getDiscovery).mockResolvedValue({ ok: false, error: "down" })
    expect(await startLogin()).toEqual({ ok: false, error: "unavailable" })
    expect(repository.createLoginAttempt).not.toHaveBeenCalled()
  })
})

describe("completeLogin", () => {
  it("creates a session for a verified identity", async () => {
    const result = await completeLogin(callback())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(repository.consumeLoginAttempt).toHaveBeenCalledWith(sha256("state-value"))
    expect(oidc.exchangeCode).toHaveBeenCalledWith(discovery, expect.anything(), {
      code: "auth-code",
      codeVerifier: "verifier",
    })
    expect(vi.mocked(oidc.verifyIdToken).mock.calls[0]?.[1]).toMatchObject({
      nonce: "nonce",
      audience: "1234567",
      issuer: discovery.issuer,
    })
    // No scope list in the token response means everything requested was granted.
    expect(repository.upsertTelegramIdentity).toHaveBeenCalledWith(profile, true)
    const session = vi.mocked(repository.createSession).mock.calls[0]?.[0]
    expect(session).toMatchObject({ userId: "user-1", tokenHash: sha256(result.data.sessionToken) })
    expect(result.data.returnTo).toBe("/account")
  })

  it("accepts a granted-scope list that includes bot access", async () => {
    vi.mocked(oidc.exchangeCode).mockResolvedValue({
      ok: true,
      data: {
        idToken: "id-token",
        grantedScopes: ["openid", "profile", "phone", "telegram:bot_access"],
      },
    })
    expect((await completeLogin(callback())).ok).toBe(true)
    expect(repository.upsertTelegramIdentity).toHaveBeenCalledWith(profile, true)
  })

  it.each([
    ["the phone number is withheld", { phoneNumber: null }, null],
    ["bot messaging is declined", {}, ["openid", "profile", "phone"]],
  ])("refuses the login and stores nothing when %s", async (_label, claims, grantedScopes) => {
    vi.mocked(oidc.verifyIdToken).mockResolvedValue({ ok: true, data: { ...profile, ...claims } })
    vi.mocked(oidc.exchangeCode).mockResolvedValue({
      ok: true,
      data: { idToken: "id-token", grantedScopes },
    })
    expect(await completeLogin(callback())).toEqual({ ok: false, error: "permissions" })
    expect(repository.upsertTelegramIdentity).not.toHaveBeenCalled()
    expect(repository.createSession).not.toHaveBeenCalled()
  })

  it.each([
    ["no state cookie", { stateCookie: null }],
    ["a state from another browser", { stateCookie: "other-state" }],
    ["no state", { state: null }],
  ])("rejects %s without consuming the attempt", async (_label, overrides) => {
    expect(await completeLogin(callback(overrides))).toEqual({ ok: false, error: "expired" })
    expect(repository.consumeLoginAttempt).not.toHaveBeenCalled()
  })

  it("rejects a replayed or expired state", async () => {
    vi.mocked(repository.consumeLoginAttempt).mockResolvedValue(null)
    expect(await completeLogin(callback())).toEqual({ ok: false, error: "expired" })
    expect(oidc.exchangeCode).not.toHaveBeenCalled()
  })

  it("reports denied consent and still consumes the attempt", async () => {
    const result = await completeLogin(callback({ code: null, error: "access_denied" }))
    expect(result).toEqual({ ok: false, error: "denied" })
    expect(repository.consumeLoginAttempt).toHaveBeenCalled()
    expect(oidc.exchangeCode).not.toHaveBeenCalled()
  })

  it("creates no session when the code exchange or token verification fails", async () => {
    vi.mocked(oidc.exchangeCode).mockResolvedValueOnce({ ok: false, error: "x" })
    expect(await completeLogin(callback())).toEqual({ ok: false, error: "failed" })
    vi.mocked(oidc.verifyIdToken).mockResolvedValueOnce({ ok: false, error: "x" })
    expect(await completeLogin(callback())).toEqual({ ok: false, error: "failed" })
    expect(repository.upsertTelegramIdentity).not.toHaveBeenCalled()
    expect(repository.createSession).not.toHaveBeenCalled()
  })

  it("issues a fresh session token on every login", async () => {
    const first = await completeLogin(callback())
    const second = await completeLogin(callback())
    expect(first.ok && second.ok && first.data.sessionToken !== second.data.sessionToken).toBe(true)
  })
})

describe("safeReturnTo", () => {
  it.each([
    ["/examples/state", "/examples/state"],
    ["https://evil.example.test", "/account"],
    ["//evil.example.test", "/account"],
    ["/\\evil.example.test", "/account"],
    [null, "/account"],
  ])("maps %s to %s", (input, expected) => {
    expect(safeReturnTo(input)).toBe(expected)
  })
})
