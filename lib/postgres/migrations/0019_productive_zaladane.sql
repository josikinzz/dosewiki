CREATE TABLE "translationCacheJobs" (
	"locale" text NOT NULL,
	"slug" text NOT NULL,
	"mode" text NOT NULL,
	"targets" text NOT NULL,
	"requested_at" bigint NOT NULL,
	CONSTRAINT "translationCacheJobs_locale_slug_mode_pk" PRIMARY KEY("locale","slug","mode")
);
--> statement-breakpoint
CREATE INDEX "translationCacheJobs_due" ON "translationCacheJobs" USING btree ("requested_at");