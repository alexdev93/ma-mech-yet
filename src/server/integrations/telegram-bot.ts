import "server-only"
import { z } from "zod"

import type { Result } from "@/shared/types/result"

const API_BASE = "https://api.telegram.org"
const TIMEOUT_MS = 5000

// Bot API replies carry `ok` and, on failure, a numeric code and a description; never the token.
const apiResponseSchema = z.object({
  ok: z.boolean(),
  error_code: z.number().int().optional(),
  description: z.string().optional(),
})

/**
 * Why a message wasn't sent. `forbidden`: the user hasn't allowed the bot to message them
 * (or blocked it), which is expected and not an error.
 */
export type SendFailure = "forbidden" | "rejected" | "unreachable"

/**
 * Sends a plain-text message through the Bot API. Calling sendMessage from here alongside the bot
 * service is fine: only getUpdates and webhooks are exclusive to one consumer of a bot token.
 */
export async function sendMessage(
  botToken: string,
  chatId: string,
  text: string,
): Promise<Result<true, SendFailure>> {
  try {
    // The URL holds the token, so it is never logged; neither is the chat id (personal data).
    const response = await fetch(`${API_BASE}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const parsed = apiResponseSchema.safeParse(await response.json().catch(() => null))
    if (parsed.success && parsed.data.ok) return { ok: true, data: true }
    if (response.status === 403) return { ok: false, error: "forbidden" }
    const reason = parsed.success ? (parsed.data.description ?? "no description") : "unreadable"
    console.error(`[telegram-bot] sendMessage failed with HTTP ${response.status}: ${reason}`)
    return { ok: false, error: "rejected" }
  } catch (error) {
    // Only the error name: some fetch errors include the request URL, which holds the token.
    console.error(`[telegram-bot] sendMessage request failed (${(error as Error)?.name})`)
    return { ok: false, error: "unreachable" }
  }
}
