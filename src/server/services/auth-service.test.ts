import { beforeEach, describe, expect, it, vi } from "vitest"

import { pkceChallenge, sha256 } from "@/server/auth/crypto"
import * as bot from "@/server/integrations/telegram-bot"
import * as oidc from "@/server/integrations/telegram-oidc"
import * as repository from "@/server/repositories/auth-repository"
import {
  type CallbackParams,
  completeLogin,
  deleteAccount,
  LOGIN_RATE_LIMIT,
  logoutEverywhere,
  safeReturnTo,
  sendLoginNotification,
  startLogin,
} from "./auth-service"

const botToken = vi.hoisted(() => ({ value: undefined as string | undefined }))
vi.mock("@/server/config/env", () => ({
  getAuthEnv: () => ({
    TELEGRAM_BOT_TOKEN: botToken.value,
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
  deleteSession: vi.fn(async () => {}),
  recordLoginOutcome: vi.fn(async () => {}),
  countRecentLoginAttempts: vi.fn(async () => 0),
  countActiveSessions: vi.fn(),
  deleteUserSessions: vi.fn(),
  deleteUser: vi.fn(),
}))
vi.mock("@/server/integrations/telegram-bot", () => ({ sendMessage: vi.fn() }))
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
    // No scope list: bot access stays unconfirmed (Telegram's list isn't reliable for it).
    expect(repository.upsertTelegramIdentity).toHaveBeenCalledWith(profile, false)
    const session = vi.mocked(repository.createSession).mock.calls[0]?.[0]
    expect(session).toMatchObject({ userId: "user-1", tokenHash: sha256(result.data.sessionToken) })
    expect(result.data.returnTo).toBe("/account")
    expect(result.data.telegramUserId).toBe("987654321")
  })

  it("confirms bot access only when Telegram explicitly lists it", async () => {
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
    [
      "the phone number is withheld",
      { phoneNumber: null },
      null,
      false,
      "success;scopes=unlisted;phone=no",
    ],
    [
      // The real Telegram case: access granted, yet missing from `scope`. Stays unconfirmed.
      "bot access isn't listed in the granted scopes",
      {},
      ["openid", "profile", "phone"],
      false,
      "success;scopes=openid,profile,phone;phone=yes",
    ],
    [
      "both are missing",
      { phoneNumber: null },
      ["openid", "profile"],
      false,
      "success;scopes=openid,profile;phone=no",
    ],
  ])(
    "still signs the user in when %s",
    async (_label, claims, grantedScopes, botAccessGranted, outcome) => {
      const withheld = { ...profile, ...claims }
      vi.mocked(oidc.verifyIdToken).mockResolvedValue({ ok: true, data: withheld })
      vi.mocked(oidc.exchangeCode).mockResolvedValue({
        ok: true,
        data: { idToken: "id-token", grantedScopes },
      })
      expect((await completeLogin(callback())).ok).toBe(true)
      expect(repository.upsertTelegramIdentity).toHaveBeenCalledWith(withheld, botAccessGranted)
      expect(repository.createSession).toHaveBeenCalled()
      expect(repository.recordLoginOutcome).toHaveBeenCalledWith(sha256("state-value"), outcome)
    },
  )

  it("records success, and a recording failure doesn't break the login", async () => {
    vi.mocked(repository.recordLoginOutcome).mockRejectedValueOnce(new Error("db down"))
    expect((await completeLogin(callback())).ok).toBe(true)
    expect(repository.recordLoginOutcome).toHaveBeenCalledWith(
      sha256("state-value"),
      "success;scopes=unlisted;phone=yes",
    )
  })

  it("records why a token step failed", async () => {
    vi.mocked(oidc.exchangeCode).mockResolvedValueOnce({ ok: false, error: "x" })
    await completeLogin(callback())
    expect(repository.recordLoginOutcome).toHaveBeenLastCalledWith(
      sha256("state-value"),
      "token_exchange_failed",
    )
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

  it("replaces this browser's previous session, but only when the login succeeds", async () => {
    await completeLogin(callback({ previousSessionToken: "old-token" }))
    expect(repository.deleteSession).toHaveBeenCalledWith(sha256("old-token"))

    vi.mocked(repository.deleteSession).mockClear()
    vi.mocked(oidc.exchangeCode).mockResolvedValueOnce({ ok: false, error: "x" })
    await completeLogin(callback({ previousSessionToken: "old-token" }))
    expect(repository.deleteSession).not.toHaveBeenCalled()
  })
})

describe("rate limiting", () => {
  it("stores a hash of the client IP, never the address", async () => {
    await startLogin(null, "203.0.113.7")
    const stored = vi.mocked(repository.createLoginAttempt).mock.calls[0]?.[0]
    expect(stored?.ipHash).toBe(sha256("203.0.113.7"))
    expect(JSON.stringify(stored)).not.toContain("203.0.113.7")
  })

  it("refuses to start once the per-IP limit is reached", async () => {
    vi.mocked(repository.countRecentLoginAttempts).mockResolvedValueOnce(LOGIN_RATE_LIMIT.max)
    expect(await startLogin(null, "203.0.113.7")).toEqual({ ok: false, error: "rate_limited" })
    expect(repository.createLoginAttempt).not.toHaveBeenCalled()
    expect(oidc.getDiscovery).not.toHaveBeenCalled()
  })
})

describe("sendLoginNotification", () => {
  it("messages the user through the bot when a bot token is configured", async () => {
    botToken.value = "123456:token"
    vi.mocked(bot.sendMessage).mockResolvedValue({ ok: true, data: true })
    vi.spyOn(console, "info").mockImplementation(() => {})

    await sendLoginNotification("987654321")

    const [token, chatId, text] = vi.mocked(bot.sendMessage).mock.calls[0] ?? []
    expect(token).toBe("123456:token")
    expect(chatId).toBe("987654321")
    expect(text).toContain("app.example.test")
    expect(text).toContain("https://app.example.test/account")
    botToken.value = undefined
  })

  it("does nothing without a bot token", async () => {
    await sendLoginNotification("987654321")
    expect(bot.sendMessage).not.toHaveBeenCalled()
  })
})

describe("account actions", () => {
  const sessionUser = { userId: "user-1" } as repository.SessionUser

  it("signs out every session of the token's owner", async () => {
    vi.mocked(repository.findSessionUser).mockResolvedValueOnce(sessionUser)
    await logoutEverywhere("token")
    expect(repository.findSessionUser).toHaveBeenCalledWith(sha256("token"))
    expect(repository.deleteUserSessions).toHaveBeenCalledWith("user-1")
  })

  it("deletes only the signed-in user's account", async () => {
    vi.mocked(repository.findSessionUser).mockResolvedValueOnce(sessionUser)
    expect(await deleteAccount("token")).toBe(true)
    expect(repository.deleteUser).toHaveBeenCalledWith("user-1")
  })

  it("does nothing for an unknown or expired session", async () => {
    vi.mocked(repository.findSessionUser).mockResolvedValue(null)
    expect(await deleteAccount("stale")).toBe(false)
    await logoutEverywhere("stale")
    expect(repository.deleteUser).not.toHaveBeenCalled()
    expect(repository.deleteUserSessions).not.toHaveBeenCalled()
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
