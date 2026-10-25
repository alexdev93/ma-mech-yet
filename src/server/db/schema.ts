import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow()

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: createdAt(),
})

/** One verified Telegram identity per user, keyed on the OIDC subject. */
export const telegramIdentities = pgTable("telegram_identities", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  oidcSub: text("oidc_sub").notNull().unique(),
  /** Numeric Telegram user id from the `id` claim, needed later for bot delivery. */
  telegramUserId: text("telegram_user_id").unique(),
  name: text("name"),
  username: text("username"),
  pictureUrl: text("picture_url"),
  /** Verified by Telegram (`phone` scope). Personal data: never logged. */
  phoneNumber: text("phone_number"),
  /**
   * true once confirmed, null while unknown. Telegram's token response doesn't list
   * telegram:bot_access even when granted, so login alone can't confirm it; the bot can
   * (its chat receives a write_access_allowed service message).
   */
  botAccessGranted: boolean("bot_access_granted"),
  /** When the bot-access state last changed (event time), so older events never overwrite it. */
  botAccessChangedAt: timestamp("bot_access_changed_at", { withTimezone: true }),
  botAccessGrantedAt: timestamp("bot_access_granted_at", { withTimezone: true }),
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }).notNull().defaultNow(),
})

/** Pending authorization requests. Consumed exactly once by the callback. */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stateHash: text("state_hash").notNull().unique(),
    nonce: text("nonce").notNull(),
    codeVerifier: text("code_verifier").notNull(),
    returnTo: text("return_to").notNull(),
    /** SHA-256 of the client IP, for rate limiting. The address itself is never stored. */
    ipHash: text("ip_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    /** Result of the callback, e.g. "success" or "token_exchange_failed". Never data. */
    outcome: text("outcome"),
    createdAt: createdAt(),
  },
  (table) => [index("login_attempts_ip_hash_created_at_idx").on(table.ipHash, table.createdAt)],
)

/** Only a hash of the session token is stored. The token itself lives in the cookie. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
)

/**
 * Bot-access signals reported by the bot service (contract section 9). Every event is kept, so a
 * grant that arrives before the account exists is applied when the user signs in.
 */
export const botAccessEvents = pgTable(
  "bot_access_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Idempotency key from the bot service: tg-{botId}-{update_id}. */
    eventId: text("event_id").notNull().unique(),
    telegramUserId: text("telegram_user_id").notNull(),
    status: text("status", { enum: ["granted", "revoked"] }).notNull(),
    source: text("source").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("bot_access_events_user_occurred_idx").on(table.telegramUserId, table.occurredAt),
  ],
)
