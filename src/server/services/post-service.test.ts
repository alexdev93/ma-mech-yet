import { cacheLife } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getLatestPosts } from "./post-service"

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

function mockFetch(response: Response | Error) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) => {
    if (response instanceof Error) throw response
    return response
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const post = (id: number, body = "Short body") => ({ id, userId: 1, title: `Post ${id}`, body })

describe("getLatestPosts", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("maps validated posts to summaries and caches them for minutes", async () => {
    const fetchMock = mockFetch(Response.json([post(1), post(2, "x".repeat(200))]))

    const result = await getLatestPosts(2)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toHaveLength(2)
    expect(result.data[0]).toEqual({ id: 1, title: "Post 1", excerpt: "Short body" })
    expect(result.data[1]?.excerpt).toHaveLength(121)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("_limit=2")
    expect(cacheLife).toHaveBeenCalledWith("minutes")
  })

  it("returns an error for unsuccessful HTTP responses and caches briefly", async () => {
    mockFetch(new Response("down", { status: 503 }))

    expect(await getLatestPosts()).toEqual({
      ok: false,
      error: "The demo API responded with HTTP 503.",
    })
    expect(cacheLife).toHaveBeenCalledWith("seconds")
  })

  it("rejects payloads that fail validation", async () => {
    mockFetch(Response.json([{ id: "not-a-number" }]))

    expect(await getLatestPosts()).toEqual({
      ok: false,
      error: "The demo API returned an unexpected payload.",
    })
  })

  it("handles network failures and timeouts", async () => {
    mockFetch(new TypeError("fetch failed"))
    expect(await getLatestPosts()).toEqual({ ok: false, error: "The demo API is unreachable." })

    mockFetch(new DOMException("timed out", "TimeoutError"))
    expect(await getLatestPosts()).toEqual({ ok: false, error: "The demo API timed out." })
  })
})
