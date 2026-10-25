import "server-only"
import { and, count, eq, gt, isNull, lt, sql } from "drizzle-orm"

import { getDb } from "@/server/db/client"
import { loginAttempts, sessions, telegramIdentities, users } from "@/server/db/schema"
import type { TelegramProfile } from "@/server/integrations/telegram-oidc"
import { applyLatestBotAccessEvent } from "./bot-access-repository"

export type NewLoginAttempt = {
  stateHash: string
  nonce: string
  codeVerifier: string
  returnTo: string
  ipHash: string | null
  expiresAt: Date
}

export type ConsumedLoginAttempt = Pick<NewLoginAttempt, "nonce" | "codeVerifier" | "returnTo">

export type SessionUser = {
  userId: string
  name: string | null
  username: string | null
  telegramUserId: string | null
  pictureUrl: string | null
  phoneNumber: string | null
  /** true once confirmed, null while unknown (see the schema). */
  botAccessGranted: boolean | null
  botAccessGrantedAt: Date | null
  linkedAt: Date
  lastLoginAt: Date
}

export async function createLoginAttempt(attempt: NewLoginAttempt): Promise<void> {
  const db = getDb()
  // Opportunistic cleanup keeps the table small without a scheduled job.
  await db.delete(loginAttempts).where(lt(loginAttempts.expiresAt, sql`now() - interval '1 day'`))
  await db.insert(loginAttempts).values(attempt)
}

export async function countRecentLoginAttempts(ipHash: string, since: Date): Promise<number> {
  const [row] = await getDb()
    .select({ count: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ipHash, ipHash), gt(loginAttempts.createdAt, since)))
  return row?.count ?? 0
}

/**
 * Marks an unexpired, unused attempt as consumed and returns it, in one statement.
 * A replayed or concurrent callback for the same state gets null.
 */
export async function consumeLoginAttempt(stateHash: string): Promise<ConsumedLoginAttempt | null> {
  const [attempt] = await getDb()
    .update(loginAttempts)
    .set({ consumedAt: sql`now()` })
    .where(
      and(
        eq(loginAttempts.stateHash, stateHash),
        isNull(loginAttempts.consumedAt),
        gt(loginAttempts.expiresAt, sql`now()`),
      ),
    )
    .returning({
      nonce: loginAttempts.nonce,
      codeVerifier: loginAttempts.codeVerifier,
      returnTo: loginAttempts.returnTo,
    })
  return attempt ?? null
}

/** Records how a consumed attempt ended, for diagnosing failed logins from the database. */
export async function recordLoginOutcome(stateHash: string, outcome: string): Promise<void> {
  await getDb().update(loginAttempts).set({ outcome }).where(eq(loginAttempts.stateHash, stateHash))
}

/**
 * Returns the user for a verified identity, creating both on first login. Safe to repeat.
 * Profile fields always take Telegram's latest values. Bot access comes from the bot's events
 * (applied here too, since the grant can arrive before the account exists); a login can only
 * confirm it, and a login that can't tell never overwrites a recorded state.
 */
export async function upsertTelegramIdentity(
  profile: TelegramProfile,
  botAccessConfirmed: boolean,
): Promise<string> {
  const fields = {
    telegramUserId: profile.telegramUserId,
    name: profile.name,
    username: profile.username,
    pictureUrl: profile.pictureUrl,
    phoneNumber: profile.phoneNumber,
  }
  return getDb().transaction(async (tx) => {
    const [existing] = await tx
      .update(telegramIdentities)
      .set({
        ...fields,
        lastLoginAt: sql`now()`,
        ...(botAccessConfirmed && {
          botAccessGranted: true,
          botAccessGrantedAt: sql`coalesce(${telegramIdentities.botAccessGrantedAt}, now())`,
          botAccessChangedAt: sql`now()`,
        }),
      })
      .where(eq(telegramIdentities.oidcSub, profile.sub))
      .returning({ userId: telegramIdentities.userId })

    let userId = existing?.userId
    if (!userId) {
      const [user] = await tx.insert(users).values({}).returning({ id: users.id })
      if (!user) throw new Error("Failed to create user")
      // A concurrent first login for the same subject hits the unique constraint and rolls back.
      await tx.insert(telegramIdentities).values({
        ...fields,
        botAccessGranted: botAccessConfirmed ? true : null,
        botAccessGrantedAt: botAccessConfirmed ? sql`now()` : null,
        botAccessChangedAt: botAccessConfirmed ? sql`now()` : null,
        userId: user.id,
        oidcSub: profile.sub,
      })
      userId = user.id
    }

    if (profile.telegramUserId) await applyLatestBotAccessEvent(profile.telegramUserId, tx)
    return userId
  })
}

export async function createSession(session: {
  tokenHash: string
  userId: string
  expiresAt: Date
}): Promise<void> {
  const db = getDb()
  await db.delete(sessions).where(lt(sessions.expiresAt, sql`now()`))
  await db.insert(sessions).values(session)
}

export async function countActiveSessions(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ count: count() })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, sql`now()`)))
  return row?.count ?? 0
}

export async function deleteUserSessions(userId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.userId, userId))
}

/** Deletes the user; the Telegram identity and sessions go with it (ON DELETE CASCADE). */
export async function deleteUser(userId: string): Promise<void> {
  await getDb().delete(users).where(eq(users.id, userId))
}

export async function findSessionUser(tokenHash: string): Promise<SessionUser | null> {
  const [row] = await getDb()
    .select({
      userId: sessions.userId,
      name: telegramIdentities.name,
      username: telegramIdentities.username,
      telegramUserId: telegramIdentities.telegramUserId,
      pictureUrl: telegramIdentities.pictureUrl,
      phoneNumber: telegramIdentities.phoneNumber,
      botAccessGranted: telegramIdentities.botAccessGranted,
      botAccessGrantedAt: telegramIdentities.botAccessGrantedAt,
      linkedAt: telegramIdentities.linkedAt,
      lastLoginAt: telegramIdentities.lastLoginAt,
    })
    .from(sessions)
    .innerJoin(telegramIdentities, eq(telegramIdentities.userId, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, sql`now()`)))
  return row ?? null
}

export async function deleteSession(tokenHash: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.tokenHash, tokenHash))
}
