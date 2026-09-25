/** Targeted public projections over effects, replications, reports, and contributors. */

import { losslessSelectList } from "../documentCodec";
import { fromRow, type Doc } from "./dbRows";
import { SubstanceProjectionReader } from "./dbSubstanceReads";

export class PublicProjectionReader extends SubstanceProjectionReader {
  async getPublicCopyBlocksByKeys(keys: readonly string[]): Promise<Doc[]> {
    if (keys.length === 0) return [];
    const result = await this.client.query(
      `SELECT ${losslessSelectList("copyBlocks")} FROM "copyBlocks" WHERE "key" = ANY($1::text[]) ORDER BY "_creationTime" ASC, "_id" ASC`,
      [keys],
    );
    return result.rows.map((row) => fromRow("copyBlocks", row));
  }

  async getPublicOverviewCounts(): Promise<{
    substanceCount: number;
    effectCount: number;
    reportCount: number;
    replicationCount: number;
    aboutConfigured: boolean;
    psychoactiveCategoryCount: number;
  }> {
    const result = await this.client.query(
      `SELECT
         (SELECT count(*)::int FROM "substanceIndex"
           WHERE COALESCE(to_jsonb("priority") #>> '{}', 'normal') NOT IN ('low', 'hide_for_now')) AS "substanceCount",
         (SELECT count(*)::int FROM "subjectiveEffects") AS "effectCount",
         (SELECT count(*)::int FROM "tripReports") AS "reportCount",
         (SELECT count(*)::int FROM "replications"
           WHERE COALESCE(to_jsonb("role") #>> '{}', 'replication') = 'replication'
             AND COALESCE(to_jsonb("publication_state") #>> '{}', 'published') = 'published'
             AND (to_jsonb("replication_status") #>> '{}') IS DISTINCT FROM 'not-replication'
             AND (to_jsonb("type") #>> '{}') IN ('image', 'video', 'audio')) AS "replicationCount",
         EXISTS (
           SELECT 1 FROM "siteConfig"
           WHERE (to_jsonb("key") #>> '{}') = 'about'
             AND (length(COALESCE("aboutMarkdown", '')) > 0
               OR length(COALESCE("aboutSubtitle", '')) > 0)
         ) AS "aboutConfigured",
         COALESCE((
           SELECT jsonb_array_length(COALESCE("categories", '[]'::jsonb))
           FROM "indexLayouts"
           WHERE (to_jsonb("type") #>> '{}') = 'psychoactive'
           ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC
           LIMIT 1
         ), 0)::int AS "psychoactiveCategoryCount"`,
    );
    const row = result.rows[0];
    return {
      substanceCount: Number(row.substanceCount),
      effectCount: Number(row.effectCount),
      reportCount: Number(row.reportCount),
      replicationCount: Number(row.replicationCount),
      aboutConfigured: row.aboutConfigured === true,
      psychoactiveCategoryCount: Number(row.psychoactiveCategoryCount),
    };
  }

  /**
   * Targeted public projection for the artist taxonomy batch. This deliberately
   * bypasses the document-shaped query path so a public credit lookup transports
   * neither unrelated artists nor private taxonomy evidence.
   */
  async getPublicArtistTaxonomyByKeys(
    keys: readonly string[],
  ): Promise<Array<{ key: string; primary_type: unknown; artist_type_tags: unknown }>> {
    if (keys.length === 0) return [];
    const result = await this.client.query(
      'SELECT "key", "primary_type", "artist_type_tags" FROM "replicationArtistTaxonomy" WHERE "key" = ANY($1::text[])',
      [keys],
    );
    return result.rows.map((row) => ({
      key: row.key as string,
      primary_type: row.primary_type,
      artist_type_tags: row.artist_type_tags,
    }));
  }

  async getPublicContributorIdentities(lookupKeys?: readonly string[]): Promise<Doc[]> {
    if (lookupKeys?.length === 0) return [];
    const normalizedKeys = lookupKeys?.map((key) => key.trim().toUpperCase()).filter(Boolean);
    const where = normalizedKeys
      ? `WHERE "mergedIntoProfileId" IS NULL AND (
          upper(btrim("key")) = ANY($1::text[])
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE("aliases", '[]'::jsonb)) AS alias(value)
            WHERE upper(btrim(alias.value)) = ANY($1::text[])
          )
        )`
      : `WHERE "mergedIntoProfileId" IS NULL`;
    const result = await this.client.query(
      `SELECT ${losslessSelectList("contributorProfiles", ["_id", "_creationTime", "key", "displayName", "aliases", "avatarUrl", "avatarR2Key", "avatarStorageId", "exclude_from_gallery", "approved_replicator", "archival"])} FROM "contributorProfiles" ${where} ORDER BY "_creationTime" ASC, "_id" ASC`,
      normalizedKeys ? [normalizedKeys] : [],
    );
    return result.rows.map((row) => fromRow("contributorProfiles", row));
  }

  async getPublicEffectProjection(
    projection: "preview" | "index" | "summary" | "slugs" | "audio" | "credits",
    slugs?: readonly string[],
  ): Promise<Doc[]> {
    if (slugs?.length === 0) return [];
    const fields = {
      preview: ["_id", "_creationTime", "slug", "name", "tags", "featured", "summary"],
      index: ["_id", "_creationTime", "slug", "name", "tags", "featured"],
      summary: ["_id", "_creationTime", "slug", "name", "long_summary_raw", "long_summary_ast", "citations", "subarticles"],
      slugs: ["_id", "_creationTime", "slug", "name"],
      audio: ["_id", "_creationTime", "slug", "name", "audio_replications"],
      credits: ["_id", "_creationTime", "slug", "name", "contributors"],
    }[projection];
    const predicates = [
      ...(slugs ? ['"slug" = ANY($1::text[])'] : []),
      ...(projection === "audio"
        ? [`jsonb_typeof("audio_replications") = 'array' AND jsonb_array_length("audio_replications") > 0`]
        : []),
    ];
    const where = predicates.length > 0 ? `WHERE ${predicates.join(" AND ")}` : "";
    const result = await this.client.query(
      `SELECT ${losslessSelectList("subjectiveEffects", fields)} FROM "subjectiveEffects" ${where} ORDER BY "_creationTime" ASC, "_id" ASC`,
      slugs ? [slugs] : [],
    );
    return result.rows.map((row) => fromRow("subjectiveEffects", row));
  }

  async getPublicTripReportBrowseRows(): Promise<Doc[]> {
    const fields = [
      "_id", "_creationTime", "slug", "title", "featured", "subject",
      "substances", "attribution_review",
    ];
    const result = await this.client.query(
      `SELECT ${losslessSelectList("tripReports", fields)}
       FROM "tripReports"
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC`,
    );
    return result.rows.map((row) => fromRow("tripReports", row));
  }

  /**
   * Complete storage-ordered gallery membership projection. Publication and
   * contributor policy remain in the handler so this SQL transports only the
   * fields those shared policies and the browse index consume.
   */
  async getPublicGalleryMembershipRows(): Promise<Doc[]> {
    const fields = [
      "_id", "_creationTime", "slug", "title", "artist", "artist_url",
      "type", "format", "effect_slug", "effect_tags", "viewing_mode_tags",
      "title_drugs", "drug_classes", "content_family", "storage_id", "r2_key",
      "url", "has_audio", "created_at", "date_info", "role",
      "publication_state", "replication_status",
    ];
    const result = await this.client.query(
      `SELECT ${losslessSelectList("replications", fields)}
       FROM "replications"
       ORDER BY "_creationTime" ASC, "_id" ASC`,
    );
    return result.rows.map((row) => fromRow("replications", row));
  }

  async getReplicationsBySlugs(slugs: readonly string[]): Promise<Doc[]> {
    if (slugs.length === 0) return [];
    const result = await this.client.query(
      `SELECT DISTINCT ON ("slug" COLLATE "C") ${losslessSelectList("replications")}
       FROM "replications" WHERE "slug" COLLATE "C" = ANY($1::text[])
       ORDER BY "slug" COLLATE "C", "_creationTime" ASC, "_id" COLLATE "C" ASC`,
      [slugs],
    );
    return result.rows.map((row) => fromRow("replications", row));
  }

  async getPublicEffectGalleryOrders(slugs: readonly string[]): Promise<Doc[]> {
    if (slugs.length === 0) return [];
    const result = await this.client.query(
      `SELECT DISTINCT ON ("slug" COLLATE "C") ${losslessSelectList("subjectiveEffects", ["_id", "_creationTime", "slug", "gallery_order"])}
       FROM "subjectiveEffects" WHERE "slug" COLLATE "C" = ANY($1::text[])
       ORDER BY "slug" COLLATE "C", "_creationTime" ASC, "_id" COLLATE "C" ASC`,
      [slugs],
    );
    return result.rows.map((row) => fromRow("subjectiveEffects", row));
  }

  async getPublicEffectReplicationPage(args: { effectSlug: string; cursor?: string; limit: number }) {
    const prefix = "effect-replications:";
    let after: { effectSlug: string; _creationTime: number; _id: string } | null = null;
    if (args.cursor) {
      try {
        if (!args.cursor.startsWith(prefix)) throw new Error();
        after = JSON.parse(args.cursor.slice(prefix.length));
        if (!after || after.effectSlug !== args.effectSlug ||
          typeof after._creationTime !== "number" || !Number.isFinite(after._creationTime) ||
          typeof after._id !== "string" || after._id.length === 0) throw new Error();
      } catch {
        throw new Error("Invalid effect replication cursor.");
      }
    }
    const limit = Number.isFinite(args.limit) ? Math.min(Math.max(Math.floor(args.limit), 1), 64) : 64;
    const params: unknown[] = [args.effectSlug];
    const continuation = after
      ? (params.push(after._creationTime, after._id), 'AND ("_creationTime", "_id" COLLATE "C") > ($2, $3::text COLLATE "C")')
      : "";
    params.push(limit + 1);
    const result = await this.client.query(
      `SELECT ${losslessSelectList("replications")} FROM "replications"
       WHERE ("effect_slug" COLLATE "C" = $1::text COLLATE "C" OR "effect_tags" @> jsonb_build_array($1::text))
       ${continuation}
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC LIMIT $${params.length}`,
      params,
    );
    const page = result.rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      page: page.map((row) => fromRow("replications", row)),
      continueCursor: last
        ? prefix + JSON.stringify({ effectSlug: args.effectSlug, _creationTime: last._creationTime, _id: last._id })
        : (args.cursor ?? ""),
      isDone: result.rows.length <= limit,
    };
  }

  async getPublicEffectCreditsByNames(names: readonly string[]): Promise<Doc[]> {
    if (names.length === 0) return [];
    const result = await this.client.query(
      `SELECT ${losslessSelectList("subjectiveEffects", ["_id", "_creationTime", "slug", "name", "contributors"])} FROM "subjectiveEffects"
       WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE("contributors", '[]'::jsonb)) AS credit(name)
         WHERE lower(btrim(credit.name)) = ANY($1::text[]))
       ORDER BY "_creationTime" ASC, "_id" ASC`,
      [names],
    );
    return result.rows.map((row) => fromRow("subjectiveEffects", row));
  }

  async getPublicArtistCreditRows(): Promise<Doc[]> {
    const result = await this.client.query(
      `SELECT ${losslessSelectList("replications", ["_id", "_creationTime", "artist", "artist_url", "effect_slug", "storage_id", "r2_key", "url"])} FROM "replications"
       WHERE COALESCE(to_jsonb("role") #>> '{}', 'replication') = 'replication'
         AND COALESCE(to_jsonb("publication_state") #>> '{}', 'published') = 'published'
         AND (to_jsonb("replication_status") #>> '{}') IS DISTINCT FROM 'not-replication'
         AND (to_jsonb("type") #>> '{}') IN ('image', 'video', 'audio')
       ORDER BY "_creationTime" ASC, "_id" ASC`,
    );
    return result.rows.map((row) => fromRow("replications", row));
  }

  async getPublicTripReportsByContributor(profileKey: string, authorNames: readonly string[]): Promise<Doc[]> {
    const result = await this.client.query(
      `SELECT ${losslessSelectList("tripReports", ["_id", "_creationTime", "slug", "title", "featured", "subject", "substances", "introduction", "onset", "peak", "offset", "conclusion", "tags", "license", "attribution_review"])} FROM "tripReports"
       WHERE upper(btrim("subject"->>'profile_key')) = $1
          OR ("attribution_review" IS NULL AND lower(btrim("subject"->>'name')) = ANY($2::text[]))
       ORDER BY "_creationTime" ASC, "_id" ASC`,
      [profileKey.trim().toUpperCase(), authorNames.map((name) => name.trim().toLowerCase()).filter(Boolean)],
    );
    return result.rows.map((row) => fromRow("tripReports", row));
  }

  async getPublishedPublicationIndex(kind: "article" | "blog") {
    const kindPredicate = kind === "blog"
      ? `"kind" = 'blog'`
      : `"kind" IS DISTINCT FROM 'blog'`;
    const result = kind === "blog"
      ? await this.client.query(String.raw`
          SELECT "slug", "title", "publication_status", "publicationDate", "kind",
            "teaser", "coverImageUrl",
            CASE WHEN btrim(COALESCE("teaser", '')) <> '' THEN NULL ELSE left(
              btrim(regexp_replace(regexp_replace(regexp_replace(
                COALESCE((SELECT block FROM regexp_split_to_table("body_raw", '\n{2,}') WITH ORDINALITY AS b(block, position)
                  WHERE block !~ '^\s*$' ORDER BY position LIMIT 1), ''),
                '\[([^\]]+)\]\([^)]*\)', '\1', 'g'), '[*_` + "`" + String.raw`#>]', '', 'g'), '\s+', ' ', 'g')),
              256
            ) END AS excerpt_source
          FROM "effectIndexArticles"
          WHERE "status" IS DISTINCT FROM 'draft' AND "publication_status" = 'published'
            AND ${kindPredicate}
          ORDER BY "_creationTime" ASC, "_id" ASC
        `)
      : await this.client.query(String.raw`
          WITH published AS (
            SELECT * FROM "effectIndexArticles"
            WHERE "status" IS DISTINCT FROM 'draft' AND "publication_status" = 'published'
              AND ${kindPredicate}
          ), prose AS (
            SELECT p.*,
              btrim(regexp_replace(regexp_replace("body_raw", '\[[^\]]*\]', ' ', 'g'), '\s+', ' ', 'g')) AS reading_prose,
              CASE WHEN btrim(COALESCE("shortDescription", '')) <> '' THEN NULL ELSE
                btrim(regexp_replace(regexp_replace(
                  regexp_replace("body_raw", '\[h[1-6]\][\s\S]*?\[/h[1-6]\]|^#{1,6}\s.*$', ' ', 'gn'),
                  '\[[^\]]*\]', ' ', 'g'), '\s+', ' ', 'g'))
              END AS description_prose
            FROM published p
          )
          SELECT "slug", "title", "tags", "publication_status", "featured", "shortDescription",
            "publicationDate", "kind", "bodyFormat",
            left(description_prose, 256) AS description_source,
            CASE WHEN reading_prose = '' THEN NULL
              ELSE greatest(1, floor(array_length(string_to_array(reading_prose, ' '), 1) / 220.0 + 0.5))::integer END AS "readMinutes"
          FROM prose ORDER BY "_creationTime" ASC, "_id" ASC
        `);
    return result.rows;
  }

  /**
   * Compact related-report cards for article startup. The ready index uses a
   * targeted join. Before backfill readiness, Postgres scans the same compact
   * projection and applies the legacy case-insensitive membership test without
   * transporting narrative bodies.
   */
  async getPublicTripReportPreviewsBySubstanceNames(
    names: readonly string[],
  ): Promise<Doc[]> {
    if (names.length === 0) return [];
    const lowerNames = new Set(names.map((name) => name.toLowerCase()));
    const state = await this.client.query(
      'SELECT "version", "ready" FROM "publicReadIndexState" WHERE "name" = $1 ORDER BY "_creationTime" ASC LIMIT 2',
      ["tripReports"],
    );
    const indexReady =
      state.rows.length === 1 &&
      state.rows[0]?.version === 1 &&
      state.rows[0]?.ready === true;
    const result = indexReady
      ? await this.client.query(
          'SELECT r."_id", r."_creationTime", r."slug", r."title", r."featured", r."subject", r."substances", r."attribution_review" FROM "tripReports" r WHERE EXISTS (SELECT 1 FROM "tripReportSubstances" s WHERE s."report_id" = r."_id" AND s."name_lower" = ANY($1::text[])) ORDER BY r."_creationTime" ASC, r."_id" ASC',
          [[...lowerNames]],
        )
      : await this.client.query(
          'SELECT "_id", "_creationTime", "slug", "title", "featured", "subject", "substances", "attribution_review" FROM "tripReports" ORDER BY "_creationTime" ASC, "_id" ASC',
        );
    const rows = result.rows as Doc[];
    return indexReady
      ? rows
      : rows.filter((report) =>
          (report.substances as Array<{ name: string }>).some((substance) =>
            lowerNames.has(substance.name.toLowerCase()),
          ),
        );
  }
}
