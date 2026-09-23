CREATE TABLE "translationReviewEntries" (
	"locale" text NOT NULL,
	"scope" text NOT NULL,
	"source_id" text NOT NULL,
	"revision" integer NOT NULL,
	"draft" jsonb,
	"approved" jsonb,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "translationReviewEntries_locale_scope_source_id_pk" PRIMARY KEY("locale","scope","source_id")
);
--> statement-breakpoint
CREATE TABLE "translationReviewHistory" (
	"locale" text NOT NULL,
	"scope" text NOT NULL,
	"source_id" text NOT NULL,
	"revision" integer NOT NULL,
	"action" text NOT NULL,
	"before_state" jsonb NOT NULL,
	"after_state" jsonb NOT NULL,
	"actor" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "translationReviewHistory_locale_scope_source_id_revision_pk" PRIMARY KEY("locale","scope","source_id","revision")
);
--> statement-breakpoint
CREATE TABLE "translationSegmentHistory" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"locale" text NOT NULL,
	"hash" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "translationGlossary" ADD COLUMN "retranslation_requested_at" bigint;--> statement-breakpoint
CREATE INDEX "translationSegmentHistory_by_locale" ON "translationSegmentHistory" USING btree ("locale","id");--> statement-breakpoint
CREATE INDEX "translationSegmentHistory_by_hash" ON "translationSegmentHistory" USING btree ("locale","hash","id");