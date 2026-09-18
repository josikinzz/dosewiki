CREATE TABLE "localizedPublicationIndexState" (
	"key" text PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "localizedPublicationIndexes" (
	"locale" text NOT NULL,
	"publication_id" text NOT NULL,
	"source_revision" text NOT NULL,
	"overlay_revision" text,
	"dependency_hashes" text[] DEFAULT '{}' NOT NULL,
	"dirty" boolean DEFAULT true NOT NULL,
	"title" text,
	"short_description" text,
	"index_description" text,
	"read_minutes" integer,
	CONSTRAINT "localizedPublicationIndexes_locale_publication_id_pk" PRIMARY KEY("locale","publication_id")
);
