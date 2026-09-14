CREATE TABLE "translationGlossaryTerms" (
	"term" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"gloss" text NOT NULL,
	"updated_at" bigint NOT NULL,
	"updated_by" text
);
