CREATE TABLE "bot_access_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"telegram_user_id" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bot_access_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "telegram_identities" ADD COLUMN "bot_access_changed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "bot_access_events_user_occurred_idx" ON "bot_access_events" USING btree ("telegram_user_id","occurred_at");