
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
