import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"

import { getBotEventsConfig } from "@/server/config/env"
import {
  BOT_ACCESS_PATH,
  botAccessEventSchema,
  describeIssues,
  MAX_BODY_BYTES,
  verifyRequest,
} from "@/server/integrations/bot-events"
import { recordBotAccessEvent } from "@/server/services/bot-access-service"

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

/** Bot-access events from the bot service. Contract: docs/contracts/telegram-otp.v1.md, section 9. */
export async function POST(request: Request): Promise<NextResponse> {
  const headerId = request.headers.get("x-request-id") ?? ""
  const requestId = REQUEST_ID_PATTERN.test(headerId) ? headerId : randomUUID()
  const reply = (status: number, body: Record<string, unknown>) =>
    NextResponse.json(
      { requestId, ...body },
      { status, headers: { "X-Request-Id": requestId, "Cache-Control": "no-store" } },
    )
  const fail = (status: number, code: string, message: string, details?: unknown) =>
    reply(status, { error: { code, message, ...(details !== undefined && { details }) } })

  const config = getBotEventsConfig()
  if (!config) return fail(503, "not_configured", "Bot-access events are not configured")

  if (!/^application\/json(;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return fail(415, "unsupported_media_type", "Content-Type must be application/json")
  }
  const tooLarge = () =>
    fail(413, "payload_too_large", `Body must be at most ${MAX_BODY_BYTES} bytes`)
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return tooLarge()
  const body = await request.text()
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) return tooLarge()

  const verified = verifyRequest({
    clientId: config.clientId,
    secrets: config.secrets,
    headers: request.headers,
    method: "POST",
    path: BOT_ACCESS_PATH,
    body,
    nowMs: Date.now(),
  })
  if (!verified.ok) {
    console.warn(`[bot-access] Rejected request ${requestId} (${verified.error})`)
    return fail(401, "unauthorized", "Missing or invalid request signature")
  }

  let input: unknown
  try {
    input = JSON.parse(body)
  } catch {
    return fail(400, "invalid_request", "Body must be valid JSON")
  }
  const parsed = botAccessEventSchema.safeParse(input)
  if (!parsed.success) {
    return fail(
      400,
      "invalid_request",
      "Request body failed validation",
      describeIssues(parsed.error, input),
    )
  }

  try {
    const result = await recordBotAccessEvent(parsed.data)
    return reply(200, { eventId: parsed.data.eventId, ...result })
  } catch (error) {
    console.error(`[bot-access] Could not record event ${requestId}`, error)
    return fail(500, "internal_error", "Internal error")
  }
}
