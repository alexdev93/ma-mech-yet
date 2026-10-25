ALTER TABLE "login_attempts" ADD COLUMN "ip_hash" text;--> statement-breakpoint
CREATE INDEX "login_attempts_ip_hash_created_at_idx" ON "login_attempts" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");