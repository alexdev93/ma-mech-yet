import { describe, expect, it } from "vitest"

import {
  BOT_ACCESS_PATH,
  botAccessEventSchema,
  describeIssues,
  signRequest,
  verifyRequest,
} from "./bot-events"

const SECRET = "e".repeat(40)
const PREVIOUS = "p".repeat(40)
const CLIENT_ID = "telegram-bot"
const NOW_MS = 1_800_000_000_000
const event = {
  eventId: "tg-999-5000",
  telegramUserId: "123456789",
  status: "granted",
  source: "website_login",
  occurredAt: "2027-01-15T08:00:00.000Z",
}
const body = JSON.stringify(event)

function headersFor(overrides: Record<string, string | undefined> = {}, signedBody = body) {
  const timestamp = overrides["x-timestamp"] ?? String(NOW_MS / 1000)
  const all: Record<string, string | undefined> = {
    "x-client-id": CLIENT_ID,
    "x-timestamp": timestamp,
    "x-signature": signRequest({
      secret: SECRET,
      method: "POST",
      path: BOT_ACCESS_PATH,
      timestamp,
      body: signedBody,
    }),
    ...overrides,
  }
  return new Headers(
    Object.entries(all).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
}

const verify = (headers: Headers, receivedBody = body, secrets = [SECRET]) =>
  verifyRequest({
    clientId: CLIENT_ID,
    secrets,
    headers,
    method: "POST",
    path: BOT_ACCESS_PATH,
    body: receivedBody,
    nowMs: NOW_MS,
  })

describe("signRequest", () => {
  it("matches the bot service's implementation byte for byte", () => {
    // Produced by telegram-bot-using-node-js/src/internal/auth.js signRequest with the same inputs
    expect(
      signRequest({
        secret: SECRET,
        method: "POST",
        path: BOT_ACCESS_PATH,
        timestamp: 1_800_000_000,
        body,
      }),
    ).toBe("v1=8e76400c13c8f902365e52656e73802d8c58a8c2fa740dcaf52acb19cce4c2bd")
  })
})

describe("verifyRequest", () => {
  it("accepts a correctly signed request", () => {
    expect(verify(headersFor())).toEqual({ ok: true, data: true })
  })

  it("accepts the previous secret during a rotation", () => {
    const timestamp = String(NOW_MS / 1000)
    const signature = signRequest({
      secret: PREVIOUS,
      method: "POST",
      path: BOT_ACCESS_PATH,
      timestamp,
      body,
    })
    expect(verify(headersFor({ "x-signature": signature }), body, [SECRET, PREVIOUS]).ok).toBe(true)
  })

  it.each([
    ["an unknown client", { "x-client-id": "browser" }, "unknown_client"],
    ["a missing timestamp", { "x-timestamp": undefined }, "bad_timestamp"],
    ["a stale timestamp", { "x-timestamp": String(NOW_MS / 1000 - 61) }, "bad_signature"],
    ["a missing signature", { "x-signature": undefined }, "missing_signature"],
    ["a wrong secret", { "x-signature": `v1=${"0".repeat(64)}` }, "bad_signature"],
  ])("rejects %s", (_label, overrides, reason) => {
    const result = verify(headersFor(overrides))
    expect(result.ok).toBe(false)
    if (!result.ok && reason !== "bad_signature") expect(result.error).toBe(reason)
  })

  it("rejects a timestamp outside the 60 s window even when correctly signed", () => {
    const old = String(NOW_MS / 1000 - 61)
    expect(verify(headersFor({ "x-timestamp": old }))).toEqual({
      ok: false,
      error: "stale_timestamp",
    })
  })

  it("rejects a body changed after signing", () => {
    const tampered = JSON.stringify({ ...event, telegramUserId: "999" })
    expect(verify(headersFor(), tampered)).toEqual({ ok: false, error: "bad_signature" })
  })
})

describe("botAccessEventSchema", () => {
  it("accepts a valid event and parses the time", () => {
    const parsed = botAccessEventSchema.parse(event)
    expect(parsed.occurredAt).toEqual(new Date("2027-01-15T08:00:00.000Z"))
  })

  it("names unknown, missing and invalid fields without echoing values", () => {
    const { telegramUserId: _id, ...rest } = event
    const input = { ...rest, status: "maybe", chatId: "555" }
    const result = botAccessEventSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (result.success) return
    const details = describeIssues(result.error, input)
    expect(details).toEqual(
      expect.arrayContaining([
        { field: "chatId", issue: "unknown field" },
        { field: "telegramUserId", issue: "required" },
        { field: "status", issue: "invalid" },
      ]),
    )
    expect(JSON.stringify(details)).not.toContain("maybe")
  })

  it.each([
    ["a numeric Telegram id", { telegramUserId: 123456789 }],
    ["an unsafe Telegram id", { telegramUserId: "99999999999999999" }],
    ["a time without a timezone", { occurredAt: "2027-01-15T08:00:00" }],
    ["an unknown source", { source: "guess" }],
    ["an eventId with spaces", { eventId: "tg 1" }],
  ])("rejects %s", (_label, override) => {
    expect(botAccessEventSchema.safeParse({ ...event, ...override }).success).toBe(false)
  })
})
