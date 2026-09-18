CREATE TABLE "translationGlossary" (
	"locale" text NOT NULL,
	"term" text NOT NULL,
	"target" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"reviewed_at" bigint,
	"reviewed_by" text,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "translationGlossary_locale_term_pk" PRIMARY KEY("locale","term")
);
--> statement-breakpoint
CREATE INDEX "translationGlossary_by_status" ON "translationGlossary" USING btree ("locale","status");