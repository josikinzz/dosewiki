DROP INDEX "translationJobs_due";--> statement-breakpoint
ALTER TABLE "translationJobs" ADD COLUMN "mode" text DEFAULT 'incremental' NOT NULL;--> statement-breakpoint
ALTER TABLE "translationJobs" ADD COLUMN "run_id" text;--> statement-breakpoint
ALTER TABLE "translationJobs" ADD COLUMN "terminal_status" text;--> statement-breakpoint
CREATE INDEX "translationJobs_run" ON "translationJobs" USING btree ("run_id","completed_at");--> statement-breakpoint
CREATE INDEX "translationJobs_due" ON "translationJobs" USING btree ("mode","locale","completed_at","claimed_at");