import "server-only"

import type { BotAccessEvent } from "@/server/integrations/bot-events"
import {
  applyBotAccessChange,
  insertBotAccessEvent,
} from "@/server/repositories/bot-access-repository"

export type RecordedEvent = {
  /** The eventId was already stored; nothing changed. */
  duplicate: boolean
  /** An account was updated now. False: no account has this Telegram user yet, or a newer change won. */
  applied: boolean
}

export async function recordBotAccessEvent(event: BotAccessEvent): Promise<RecordedEvent> {
  if (!(await insertBotAccessEvent(event))) return { duplicate: true, applied: false }
  const applied = await applyBotAccessChange(event)
  // The Telegram user id is personal data and stays out of the log
  const result = applied ? "applied" : "stored, not applied (no account yet, or a newer change)"
  console.info(`[bot-access] ${event.status} via ${event.source}: ${result}`)
  return { duplicate: false, applied }
}
