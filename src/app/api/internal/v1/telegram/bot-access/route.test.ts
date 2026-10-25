import { beforeEach, describe, expect, it, vi } from "vitest"

import { getBotEventsConfig } from "@/server/config/env"
import { BOT_ACCESS_PATH, signRequest } from "@/server/integrations/bot-events"
import { recordBotAccessEvent } from "@/server/services/bot-access-service"
import { POST } from "./route"

vi.mock("@/server/config/env", () => ({ getBotEventsConfig: vi.fn() }))
vi.mock("@/server/services/bot-access-service", () => ({ recordBotAccessEvent: vi.fn() }))

const SECRET = "e".repeat(40)
const event = {
  eventId: "tg-999-5000",
  telegramUserId: "123456789",
  status: "granted",
  source: "website_login",
  occurredAt: "2027-01-15T08:00:00.000Z",
}

function request(
  body: string,
  options: { secret?: string; headers?: Record<string, string> } = {},
) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = signRequest({
    secret: options.secret ?? SECRET,
    method: "POST",
    path: BOT_ACCESS_PATH,
    timestamp,
    body,
  })
  return new Request(`https://app.example.test${BOT_ACCESS_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-client-id": "telegram-bot",
      "x-timestamp": timestamp,
      "x-signature": signature,
      "x-request-id": "evt-1",
      ...options.headers,
    },
    body,
  })
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.mocked(getBotEventsConfig).mockReturnValue({ clientId: "telegram-bot", secrets: [SECRET] })
  vi.mocked(recordBotAccessEvent).mockResolvedValue({ duplicate: false, applied: true })
})

describe("POST /api/internal/v1/telegram/bot-access", () => {
  it("records a correctly signed event", async () => {
    const res = await POST(request(JSON.stringify(event)))
    expect(res.status).toBe(200)
    expect(res.headers.get("x-request-id")).toBe("evt-1")
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.json()).toEqual({
      requestId: "evt-1",
      eventId: "tg-999-5000",
      duplicate: false,
      applied: true,
    })
    expect(vi.mocked(recordBotAccessEvent).mock.calls[0]?.[0]).toMatchObject({
      telegramUserId: "123456789",
      occurredAt: new Date(event.occurredAt),
    })
  })

  it("rejects a wrong signature without recording anything", async () => {
    const res = await POST(request(JSON.stringify(event), { secret: "x".repeat(40) }))
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe("unauthorized")
    expect(recordBotAccessEvent).not.toHaveBeenCalled()
  })

  it("answers 503 when no secret is configured", async () => {
    vi.mocked(getBotEventsConfig).mockReturnValue(null)
    expect((await POST(request(JSON.stringify(event)))).status).toBe(503)
  })

  it("rejects non-JSON, oversized and malformed bodies", async () => {
    const text = request(JSON.stringify(event), { headers: { "content-type": "text/plain" } })
    expect((await POST(text)).status).toBe(415)
    expect(
      (await POST(request(JSON.stringify({ ...event, eventId: "x".repeat(5000) })))).status,
    ).toBe(413)
    expect((await POST(request("{not json"))).status).toBe(400)
  })

  it("lists invalid fields by name", async () => {
    const res = await POST(request(JSON.stringify({ ...event, status: "maybe" })))
    expect(res.status).toBe(400)
    expect((await res.json()).error.details).toEqual([{ field: "status", issue: "invalid" }])
  })

  it("answers 500 when storing fails, so the bot retries", async () => {
    vi.mocked(recordBotAccessEvent).mockRejectedValue(new Error("db down"))
    expect((await POST(request(JSON.stringify(event)))).status).toBe(500)
  })
})
