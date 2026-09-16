import { writeFileSync } from "node:fs";

/** Producer for the custom Drizzle migration. Never executes SQL. */
export const LOCALIZED_PUBLICATION_INDEX_TRIGGERS = String.raw`
INSERT INTO "localizedPublicationIndexState" ("key", "revision") VALUES ('all', 0);
--> statement-breakpoint
CREATE FUNCTION "lockLocalizedPublicationIndexProducers"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE "localizedPublicationIndexState" SET "revision" = "revision" + 1 WHERE "key" = 'all';
  IF NOT FOUND THEN RAISE EXCEPTION 'Localized publication index producer state is not initialized'; END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "localizedPublicationIndexSourceLock" BEFORE INSERT OR UPDATE OR DELETE ON "effectIndexArticles"
FOR EACH STATEMENT EXECUTE FUNCTION "lockLocalizedPublicationIndexProducers"();
--> statement-breakpoint
CREATE TRIGGER "localizedPublicationIndexOverlayLock" BEFORE INSERT OR UPDATE OR DELETE ON "translationSegments"
FOR EACH STATEMENT EXECUTE FUNCTION "lockLocalizedPublicationIndexProducers"();
--> statement-breakpoint
CREATE FUNCTION "invalidateLocalizedPublicationIndexSource"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "localizedPublicationIndexes" WHERE "publication_id" = OLD."_id";
    RETURN OLD;
  END IF;
  INSERT INTO "localizedPublicationIndexes" ("locale", "publication_id", "source_revision", "dirty")
  SELECT locale, NEW."_id", md5(to_jsonb(NEW)::text), true
  FROM (SELECT 'zh-Hans'::text AS locale UNION SELECT "locale" FROM "localizedPublicationIndexes") locales
  ON CONFLICT ("locale", "publication_id") DO UPDATE
  SET "source_revision" = EXCLUDED."source_revision", "dirty" = true;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "localizedPublicationIndexSourceChanged" AFTER INSERT OR UPDATE OR DELETE ON "effectIndexArticles"
FOR EACH ROW EXECUTE FUNCTION "invalidateLocalizedPublicationIndexSource"();
--> statement-breakpoint
CREATE FUNCTION "invalidateLocalizedPublicationIndexOverlay"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."locale" = OLD."locale" AND NEW."hash" = OLD."hash" AND NEW."target" = OLD."target" THEN
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    UPDATE "localizedPublicationIndexes" SET "dirty" = true
    WHERE "locale" = OLD."locale" AND OLD."hash" = ANY("dependency_hashes");
  END IF;
  IF TG_OP <> 'DELETE' THEN
    UPDATE "localizedPublicationIndexes" SET "dirty" = true
    WHERE "locale" = NEW."locale" AND NEW."hash" = ANY("dependency_hashes");
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "localizedPublicationIndexOverlayChanged" AFTER INSERT OR UPDATE OR DELETE ON "translationSegments"
FOR EACH ROW EXECUTE FUNCTION "invalidateLocalizedPublicationIndexOverlay"();
`;

const RESTORE_LOCALIZED_PUBLICATION_INDEX_TRIGGERS = String.raw`
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
`;

if (import.meta.main) {
  const output = process.argv[2];
  if (!output || !/^lib\/postgres\/migrations\/\d+_[a-z_]+\.sql$/.test(output)) {
    throw new Error("Pass the exact custom Drizzle migration .sql path; this command only generates a local file");
  }
  const restore = process.argv[3] === "--restore";
  if (process.argv.length > 4 || (process.argv[3] && !restore)) throw new Error("Only --restore is supported");
  writeFileSync(output, restore ? RESTORE_LOCALIZED_PUBLICATION_INDEX_TRIGGERS : LOCALIZED_PUBLICATION_INDEX_TRIGGERS);
}
