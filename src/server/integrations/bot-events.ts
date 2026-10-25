import "server-only"
import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"

import type { Result } from "@/shared/types/result"

/**
 * Inbound bot-access events from the bot service (docs/contracts/telegram-otp.v1.md, section 9).
 * The signature is the contract's v1 scheme, the same one the bot service verifies for OTP requests.
 */
export const BOT_ACCESS_PATH = "/api/internal/v1/telegram/bot-access"
export const MAX_BODY_BYTES = 4096
const MAX_CLOCK_SKEW_MS = 60_000

const sha256Hex = (data: string) => createHash("sha256").update(data).digest("hex")

export function signRequest(params: {
  secret: string
  method: string
  path: string
  timestamp: number | string
  body: string
}): string {
  const { secret, method, path, timestamp, body } = params
  const canonical = ["v1", method.toUpperCase(), path, String(timestamp), sha256Hex(body)].join(
    "\n",
  )
  return `v1=${createHmac("sha256", secret).update(canonical).digest("hex")}`
}

/** Why a request was rejected. Logged for operators, never sent to the caller. */
export type SignatureFailure =
  | "unknown_client"
  | "bad_timestamp"
  | "stale_timestamp"
  | "missing_signature"
  | "bad_signature"

export function verifyRequest(params: {
  clientId: string
  secrets: string[]
  headers: Headers
  method: string
  path: string
  body: string
  nowMs: number
}): Result<true, SignatureFailure> {
  const { clientId, secrets, headers, method, path, body, nowMs } = params
  const timestamp = headers.get("x-timestamp")
  const signature = headers.get("x-signature")

  if (headers.get("x-client-id") !== clientId) return { ok: false, error: "unknown_client" }
  if (!timestamp || !/^\d{1,12}$/.test(timestamp)) return { ok: false, error: "bad_timestamp" }
  if (Math.abs(nowMs - Number(timestamp) * 1000) > MAX_CLOCK_SKEW_MS) {
    return { ok: false, error: "stale_timestamp" }
  }
  if (!signature) return { ok: false, error: "missing_signature" }

  const given = Buffer.from(signature)
  const valid = secrets.some((secret) => {
    const expected = Buffer.from(signRequest({ secret, method, path, timestamp, body }))
    return expected.length === given.length && timingSafeEqual(expected, given)
  })
  return valid ? { ok: true, data: true } : { ok: false, error: "bad_signature" }
}

// Strict: unknown fields are rejected, as in the rest of the contract.
// A string id, because JSON numbers lose precision past 2^53
export const botAccessEventSchema = z.strictObject({
  eventId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  telegramUserId: z
    .string()
    .regex(/^[1-9]\d{0,15}$/)
    .refine((value) => Number.isSafeInteger(Number(value))),
  status: z.enum(["granted", "revoked"]),
  source: z.enum(["website_login", "start", "unblocked", "blocked"]),
  occurredAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
})

export type BotAccessEvent = z.infer<typeof botAccessEventSchema>

/** Field names and issues only, like the bot service's validator: values are never echoed back. */
export function describeIssues(
  error: z.ZodError,
  input: unknown,
): { field: string; issue: string }[] {
  const given = typeof input === "object" && input !== null ? input : {}
  return error.issues.flatMap((issue) => {
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => ({ field: key.slice(0, 64), issue: "unknown field" }))
    }
    const field = issue.path[0]
    if (typeof field !== "string") return [{ field: "(body)", issue: "must be a JSON object" }]
    return [{ field, issue: field in given ? "invalid" : "required" }]
  })
}
