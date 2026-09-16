
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "effectIndexArticles" ENABLE TRIGGER "localizedPublicationIndexSourceLock";
--> statement-breakpoint
ALTER TABLE "effectIndexArticles" ENABLE TRIGGER "localizedPublicationIndexSourceChanged";
--> statement-breakpoint
ALTER TABLE "translationSegments" ENABLE TRIGGER "localizedPublicationIndexOverlayLock";
--> statement-breakpoint
ALTER TABLE "translationSegments" ENABLE TRIGGER "localizedPublicationIndexOverlayChanged";
--> statement-breakpoint
UPDATE "localizedPublicationIndexes" SET "dirty" = true;
