CREATE TABLE "translationRejections" (
	"locale" text NOT NULL,
	"hash" text NOT NULL,
	"source" text NOT NULL,
	"defects" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"last_tried_at" bigint NOT NULL,
	CONSTRAINT "translationRejections_locale_hash_pk" PRIMARY KEY("locale","hash")
);
