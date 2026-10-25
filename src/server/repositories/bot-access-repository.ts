import "server-only"
import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm"

import { type Executor, getDb } from "@/server/db/client"
import { botAccessEvents, telegramIdentities } from "@/server/db/schema"
import type { BotAccessEvent } from "@/server/integrations/bot-events"

type AccessChange = Pick<BotAccessEvent, "telegramUserId" | "status" | "occurredAt">

/** Stores the event once. Returns false when the eventId was already stored. */
export async function insertBotAccessEvent(event: BotAccessEvent): Promise<boolean> {
  const rows = await getDb()
    .insert(botAccessEvents)
    .values(event)
    .onConflictDoNothing({ target: botAccessEvents.eventId })
    .returning({ id: botAccessEvents.id })
  return rows.length > 0
}

/**
 * Applies a change to the account with this Telegram user, unless a newer change is already
 * recorded. Returns false when no account matches (yet) or the change is older.
 */
export async function applyBotAccessChange(
  change: AccessChange,
  executor: Executor = getDb(),
): Promise<boolean> {
  const granted = change.status === "granted"
  const rows = await executor
    .update(telegramIdentities)
    .set({
      botAccessGranted: granted,
      // Keeps the first grant time while access lasts; a new grant after a block starts over
      botAccessGrantedAt: granted
        ? sql`coalesce(${telegramIdentities.botAccessGrantedAt}, ${change.occurredAt.toISOString()}::timestamptz)`
        : null,
      botAccessChangedAt: change.occurredAt,
    })
    .where(
      and(
        eq(telegramIdentities.telegramUserId, change.telegramUserId),
        or(
          isNull(telegramIdentities.botAccessChangedAt),
          lte(telegramIdentities.botAccessChangedAt, change.occurredAt),
        ),
      ),
    )
    .returning({ id: telegramIdentities.id })
  return rows.length > 0
}

/** Applies the newest stored event for this Telegram user, e.g. one that arrived before sign-up. */
export async function applyLatestBotAccessEvent(
  telegramUserId: string,
  executor: Executor = getDb(),
): Promise<void> {
  const [latest] = await executor
    .select({ status: botAccessEvents.status, occurredAt: botAccessEvents.occurredAt })
    .from(botAccessEvents)
    .where(eq(botAccessEvents.telegramUserId, telegramUserId))
    .orderBy(desc(botAccessEvents.occurredAt), desc(botAccessEvents.receivedAt))
    .limit(1)
  if (latest) await applyBotAccessChange({ telegramUserId, ...latest }, executor)
}
