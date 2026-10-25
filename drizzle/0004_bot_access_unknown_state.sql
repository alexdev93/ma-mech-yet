ALTER TABLE "telegram_identities" ALTER COLUMN "bot_access_granted" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "telegram_identities" ALTER COLUMN "bot_access_granted" DROP NOT NULL;--> statement-breakpoint
-- Every existing false was inferred from Telegram's scope list, which omits telegram:bot_access even when granted.
UPDATE "telegram_identities" SET "bot_access_granted" = NULL WHERE "bot_access_granted" = false;
