import { afterEach, describe, expect, it, vi } from "vitest"

import { sendMessage } from "./telegram-bot"

const TOKEN = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123"

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("sendMessage", () => {
  it("posts the chat id and text to the bot's sendMessage method", async () => {
    const fetchMock = reply(200, { ok: true, result: {} })
    vi.stubGlobal("fetch", fetchMock)

    expect(await sendMessage(TOKEN, "987654321", "Hello")).toEqual({ ok: true, data: true })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`)
    expect(JSON.parse(String(init.body))).toMatchObject({ chat_id: "987654321", text: "Hello" })
  })

  it("reports a user who hasn't allowed the bot as forbidden, without logging an error", async () => {
    vi.stubGlobal("fetch", reply(403, { ok: false, error_code: 403, description: "Forbidden" }))
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(await sendMessage(TOKEN, "987654321", "Hello")).toEqual({
      ok: false,
      error: "forbidden",
    })
    expect(errorLog).not.toHaveBeenCalled()
  })

  it("reports other API errors as rejected", async () => {
    vi.stubGlobal("fetch", reply(400, { ok: false, error_code: 400, description: "Bad Request" }))
    vi.spyOn(console, "error").mockImplementation(() => {})

    expect(await sendMessage(TOKEN, "987654321", "Hello")).toEqual({
      ok: false,
      error: "rejected",
    })
  })

  it("never logs the token when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError(`fetch failed for https://api.telegram.org/bot${TOKEN}/sendMessage`)
      }),
    )
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(await sendMessage(TOKEN, "987654321", "Hello")).toEqual({
      ok: false,
      error: "unreachable",
    })
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(TOKEN)
  })
})
