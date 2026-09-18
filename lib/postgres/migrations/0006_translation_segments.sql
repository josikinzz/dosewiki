CREATE TABLE "translationJobs" (
	"locale" text NOT NULL,
	"slug" text NOT NULL,
	"requested_at" bigint NOT NULL,
	"claimed_at" bigint,
	"completed_at" bigint,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	CONSTRAINT "translationJobs_locale_slug_pk" PRIMARY KEY("locale","slug")
);
--> statement-breakpoint
CREATE TABLE "translationSegments" (
	"locale" text NOT NULL,
	"hash" text NOT NULL,
	"source" text NOT NULL,
	"target" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "translationSegments_locale_hash_pk" PRIMARY KEY("locale","hash")
);
--> statement-breakpoint
CREATE INDEX "translationJobs_due" ON "translationJobs" USING btree ("locale","completed_at","claimed_at");--> statement-breakpoint
CREATE INDEX "translationSegments_by_prompt" ON "translationSegments" USING btree ("locale","prompt_version");