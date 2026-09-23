CREATE TABLE "glossaryFeedback" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"locale" text NOT NULL,
	"term" text NOT NULL,
	"target" text NOT NULL,
	"version" text NOT NULL,
	"id" text NOT NULL,
	"visitor" text NOT NULL,
	"details" text NOT NULL,
	"alternative" text NOT NULL,
	"status" text NOT NULL,
	"created_at" text NOT NULL,
	"review_notes" text,
	"reviewed_by" text,
	"reviewed_at" text
);
--> statement-breakpoint
CREATE TABLE "glossaryReactionEvents" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"locale" text NOT NULL,
	"term" text NOT NULL,
	"target" text NOT NULL,
	"version" text NOT NULL,
	"id" text NOT NULL,
	"visitor" text NOT NULL,
	"choice" text NOT NULL,
	"created_at" double precision NOT NULL
);
--> statement-breakpoint
CREATE INDEX "glossaryFeedback_by_creation_time" ON "glossaryFeedback" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "glossaryFeedback_by_locale_created" ON "glossaryFeedback" USING btree ("locale" COLLATE "C","created_at" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "glossaryFeedback_by_visitor_id" ON "glossaryFeedback" USING btree ("visitor" COLLATE "C","id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "glossaryReactionEvents_by_creation_time" ON "glossaryReactionEvents" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "glossaryReactionEvents_by_version_visitor" ON "glossaryReactionEvents" USING btree ("locale" COLLATE "C","term" COLLATE "C","version" COLLATE "C","visitor" COLLATE "C","created_at","_creationTime");--> statement-breakpoint
CREATE INDEX "glossaryReactionEvents_by_visitor_id" ON "glossaryReactionEvents" USING btree ("visitor" COLLATE "C","id" COLLATE "C","_creationTime");