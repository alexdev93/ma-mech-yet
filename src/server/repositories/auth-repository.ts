import "server-only"
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm"

import { getDb } from "@/server/db/client"
import { loginAttempts, sessions, telegramIdentities, users } from "@/server/db/schema"
import type { TelegramProfile } from "@/server/integrations/telegram-oidc"

export type NewLoginAttempt = {
  stateHash: string
  nonce: string
  codeVerifier: string
  returnTo: string
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
  botAccessGranted: boolean
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

/** Returns the user for a verified identity, creating both on first login. Safe to repeat. */
export async function upsertTelegramIdentity(
  profile: TelegramProfile,
  botAccessGranted: boolean,
): Promise<string> {
  const fields = {
    telegramUserId: profile.telegramUserId,
    name: profile.name,
    username: profile.username,
    pictureUrl: profile.pictureUrl,
    phoneNumber: profile.phoneNumber,
    botAccessGranted,
    // Keeps the first grant time across logins, and clears it if access is later withheld.
    botAccessGrantedAt: botAccessGranted
      ? sql`coalesce(${telegramIdentities.botAccessGrantedAt}, now())`
      : null,
  }
  return getDb().transaction(async (tx) => {
    const [existing] = await tx
      .update(telegramIdentities)
      .set({ ...fields, lastLoginAt: sql`now()` })
      .where(eq(telegramIdentities.oidcSub, profile.sub))
      .returning({ userId: telegramIdentities.userId })
    if (existing) return existing.userId

    const [user] = await tx.insert(users).values({}).returning({ id: users.id })
    if (!user) throw new Error("Failed to create user")
    // A concurrent first login for the same subject hits the unique constraint and rolls back.
    await tx.insert(telegramIdentities).values({
      ...fields,
      botAccessGrantedAt: botAccessGranted ? sql`now()` : null,
      userId: user.id,
      oidcSub: profile.sub,
    })
    return user.id
  })
}

export async function createSession(session: {
  tokenHash: string
  userId: string
  expiresAt: Date
}): Promise<void> {
  await getDb().insert(sessions).values(session)
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
