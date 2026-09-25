CREATE TABLE "inboxClaims" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"source" text NOT NULL,
	"item_id" text NOT NULL,
	"claimed_by" text NOT NULL,
	"claimed_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "inboxClaims_by_creation_time" ON "inboxClaims" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "inboxClaims_by_source_item" ON "inboxClaims" USING btree ("source" COLLATE "C","item_id" COLLATE "C","_creationTime");