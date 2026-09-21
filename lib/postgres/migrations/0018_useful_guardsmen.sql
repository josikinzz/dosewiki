CREATE TABLE "translationWorkerLeases" (
	"mode" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "translationJobs" DROP CONSTRAINT "translationJobs_locale_slug_pk";--> statement-breakpoint
ALTER TABLE "translationJobs" ADD CONSTRAINT "translationJobs_locale_slug_mode_pk" PRIMARY KEY("locale","slug","mode");