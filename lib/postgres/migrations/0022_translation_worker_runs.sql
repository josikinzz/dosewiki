CREATE TABLE "translationWorkerRuns" (
	"id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"lease_held" boolean NOT NULL,
	"started_at" bigint NOT NULL,
	"duration_ms" integer NOT NULL,
	"claimed" integer NOT NULL,
	"completed" integer NOT NULL,
	"failed" integer NOT NULL,
	"exhausted" integer NOT NULL,
	"cache_pending" integer NOT NULL,
	"prompt_tokens" bigint NOT NULL,
	"completion_tokens" bigint NOT NULL,
	"requests" integer NOT NULL,
	"first_error" text
);
--> statement-breakpoint
CREATE INDEX "translationWorkerRuns_by_mode" ON "translationWorkerRuns" USING btree ("mode","started_at");