ALTER TABLE "publicCachePublications" ADD COLUMN "deadLetteredAt" double precision;--> statement-breakpoint
ALTER TABLE "translationCacheJobs" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "translationCacheJobs" ADD COLUMN "next_attempt_at" bigint;--> statement-breakpoint
ALTER TABLE "translationCacheJobs" ADD COLUMN "last_error" text;--> statement-breakpoint
CREATE INDEX "publicCachePublications_by_fresh" ON "publicCachePublications" USING btree ("pending","attempts","nextAttemptAt","_creationTime");