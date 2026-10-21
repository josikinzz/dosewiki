import { losslessSelectList } from "../documentCodec";
import { fromProjectedRow, fromTableRow } from "./dbRows";
import type { Doc } from "./dataModel";
import {
  publicArtistCreditColumns,
  publicContributorIdentityColumns,
  publicEffectGalleryOrderColumns,
  publicEffectProjectionColumns,
  publicGalleryMembershipColumns,
  publicTripReportContributorColumns,
  publicTripReportPreviewColumns,
  publishedArticleIndexColumns,
  publishedBlogIndexColumns,
  type PublicArtistCreditRow,
  type PublicArtistTaxonomyRow,
  type PublicContributorIdentityRow,
  type PublicEffectGalleryOrderRow,
  type PublicEffectProjection,
  type PublicEffectProjectionRow,
  type PublicEffectReplicationPage,
  type PublicGalleryMembershipRow,
  type PublicOverviewCounts,
  type PublicProjectionReads,
  type PublicTripReportBrowseRow,
  type PublicTripReportContributorRow,
  type PublicTripReportPreviewRow,
  type PublishedArticleIndexRow,
  type PublishedBlogIndexRow,
} from "./projectionReads";
import { SubstanceProjectionReader } from "./dbSubstanceReads";

export class PublicProjectionReader extends SubstanceProjectionReader implements PublicProjectionReads {
  async getPublicCopyBlocksByKeys(keys: readonly string[]): Promise<Doc<"copyBlocks">[]> {
    if (keys.length === 0) return [];
    const result = await this.client.query(
      `SELECT ${losslessSelectList("copyBlocks")} FROM "copyBlocks" WHERE "key" = ANY($1::text[]) ORDER BY "_creationTime" ASC, "_id" ASC`,
      [keys],
    );
    return result.rows.map((row) => fromTableRow("copyBlocks", row));
  }

  async getPublicOverviewCounts(): Promise<PublicOverviewCounts> {
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

  async getPublicArtistTaxonomyByKeys(keys: readonly string[]): Promise<PublicArtistTaxonomyRow[]> {
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

  async getPublicContributorIdentities(lookupKeys?: readonly string[]): Promise<PublicContributorIdentityRow[]> {
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
      `SELECT ${losslessSelectList("contributorProfiles", publicContributorIdentityColumns)} FROM "contributorProfiles" ${where} ORDER BY "_creationTime" ASC, "_id" ASC`,
      normalizedKeys ? [normalizedKeys] : [],
    );
    return result.rows.map((row) => fromProjectedRow("contributorProfiles", publicContributorIdentityColumns, row));
  }

  async getPublicEffectProjection<Projection extends PublicEffectProjection>(
    projection: Projection,
    slugs?: readonly string[],
  ): Promise<PublicEffectProjectionRow<Projection>[]> {
    if (slugs?.length === 0) return [];
    const fields: (typeof publicEffectProjectionColumns)[Projection] = publicEffectProjectionColumns[projection];
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
    return result.rows.map((row) =>
      fromProjectedRow<"subjectiveEffects", (typeof publicEffectProjectionColumns)[Projection][number]>("subjectiveEffects", fields, row));
  }

  async getPublicTripReportBrowseRows(excerptSourceLength: number): Promise<PublicTripReportBrowseRow[]> {
    const result = await this.client.query(
      String.raw`SELECT ${losslessSelectList("tripReports", publicTripReportPreviewColumns)},
         left(regexp_replace(concat_ws(' ', "introduction", (
           SELECT string_agg(entry.value->>'description', ' ' ORDER BY timeline.phase, entry.position)
           FROM (VALUES (1, "onset"), (2, "peak"), (3, "offset")) AS timeline(phase, entries)
           CROSS JOIN LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(timeline.entries) = 'array' THEN timeline.entries ELSE '[]'::jsonb END
           ) WITH ORDINALITY AS entry(value, position)
         ), "conclusion"), '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+', ' ', 'g'), $1::int) AS "excerpt_source"
       FROM "tripReports"
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC`,
      [excerptSourceLength],
    );
    return result.rows.map((row) => ({
      ...fromProjectedRow("tripReports", publicTripReportPreviewColumns, row),
      excerpt_source: typeof row.excerpt_source === "string" ? row.excerpt_source : null,
    }));
  }

  async getPublicGalleryMembershipRows(): Promise<PublicGalleryMembershipRow[]> {
    const result = await this.client.query(
      `SELECT ${losslessSelectList("replications", publicGalleryMembershipColumns)}
       FROM "replications"
       ORDER BY "_creationTime" ASC, "_id" ASC`,
    );
    return result.rows.map((row) => fromProjectedRow("replications", publicGalleryMembershipColumns, row));
  }

  async getReplicationsBySlugs(slugs: readonly string[]): Promise<Doc<"replications">[]> {
    if (slugs.length === 0) return [];
    const result = await this.client.query(
      `SELECT DISTINCT ON ("slug" COLLATE "C") ${losslessSelectList("replications")}
       FROM "replications" WHERE "slug" COLLATE "C" = ANY($1::text[])
       ORDER BY "slug" COLLATE "C", "_creationTime" ASC, "_id" COLLATE "C" ASC`,
      [slugs],
    );
    return result.rows.map((row) => fromTableRow("replications", row));
  }

  async getPublicEffectGalleryOrders(slugs: readonly string[]): Promise<PublicEffectGalleryOrderRow[]> {
    if (slugs.length === 0) return [];
    const result = await this.client.query(
      `SELECT DISTINCT ON ("slug" COLLATE "C") ${losslessSelectList("subjectiveEffects", publicEffectGalleryOrderColumns)}
       FROM "subjectiveEffects" WHERE "slug" COLLATE "C" = ANY($1::text[])
       ORDER BY "slug" COLLATE "C", "_creationTime" ASC, "_id" COLLATE "C" ASC`,
      [slugs],
    );
    return result.rows.map((row) => fromProjectedRow("subjectiveEffects", publicEffectGalleryOrderColumns, row));
  }

  async getPublicEffectReplicationPage(args: { effectSlug: string; cursor?: string; limit: number }): Promise<PublicEffectReplicationPage> {
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
      page: page.map((row) => fromTableRow("replications", row)),
      continueCursor: last
        ? prefix + JSON.stringify({ effectSlug: args.effectSlug, _creationTime: last._creationTime, _id: last._id })
        : (args.cursor ?? ""),
      isDone: result.rows.length <= limit,
    };
  }

  async getPublicEffectCreditsByNames(names: readonly string[]): Promise<PublicEffectProjectionRow<"credits">[]> {
    if (names.length === 0) return [];
    const result = await this.client.query(
      `SELECT ${losslessSelectList("subjectiveEffects", publicEffectProjectionColumns.credits)} FROM "subjectiveEffects"
       WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE("contributors", '[]'::jsonb)) AS credit(name)
         WHERE lower(btrim(credit.name)) = ANY($1::text[]))
       ORDER BY "_creationTime" ASC, "_id" ASC`,
      [names],
    );
    return result.rows.map((row) => fromProjectedRow("subjectiveEffects", publicEffectProjectionColumns.credits, row));
  }

  async getPublicArtistCreditRows(): Promise<PublicArtistCreditRow[]> {
    const result = await this.client.query(
      `SELECT ${losslessSelectList("replications", publicArtistCreditColumns)} FROM "replications"
       WHERE COALESCE(to_jsonb("role") #>> '{}', 'replication') = 'replication'
         AND COALESCE(to_jsonb("publication_state") #>> '{}', 'published') = 'published'
         AND (to_jsonb("replication_status") #>> '{}') IS DISTINCT FROM 'not-replication'
         AND (to_jsonb("type") #>> '{}') IN ('image', 'video', 'audio')
       ORDER BY "_creationTime" ASC, "_id" ASC`,
    );
    return result.rows.map((row) => fromProjectedRow("replications", publicArtistCreditColumns, row));
  }

  async getPublicTripReportsByContributor(profileKey: string, authorNames: readonly string[]): Promise<PublicTripReportContributorRow[]> {
    const result = await this.client.query(
      `SELECT ${losslessSelectList("tripReports", publicTripReportContributorColumns)} FROM "tripReports"
       WHERE upper(btrim("subject"->>'profile_key')) = $1
          OR ("attribution_review" IS NULL AND lower(btrim("subject"->>'name')) = ANY($2::text[]))
       ORDER BY "_creationTime" ASC, "_id" ASC`,
      [profileKey.trim().toUpperCase(), authorNames.map((name) => name.trim().toLowerCase()).filter(Boolean)],
    );
    return result.rows.map((row) => fromProjectedRow("tripReports", publicTripReportContributorColumns, row));
  }

  async getPublishedArticleIndex(): Promise<PublishedArticleIndexRow[]> {
    const result = await this.client.query(String.raw`
      WITH published AS (
        SELECT * FROM "effectIndexArticles"
        WHERE "status" IS DISTINCT FROM 'draft' AND "publication_status" = 'published'
          AND "kind" IS DISTINCT FROM 'blog'
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
      SELECT ${losslessSelectList("effectIndexArticles", publishedArticleIndexColumns)},
        left(description_prose, 256) AS description_source,
        CASE WHEN reading_prose = '' THEN NULL
          ELSE greatest(1, floor(array_length(string_to_array(reading_prose, ' '), 1) / 220.0 + 0.5))::integer END AS "readMinutes"
      FROM prose ORDER BY "_creationTime" ASC, "_id" ASC
    `);
    return result.rows.map((row) => ({
      ...fromProjectedRow("effectIndexArticles", publishedArticleIndexColumns, row),
      description_source: typeof row.description_source === "string" ? row.description_source : null,
      readMinutes: typeof row.readMinutes === "number" ? row.readMinutes : null,
    }));
  }

  async getPublishedBlogIndex(): Promise<PublishedBlogIndexRow[]> {
    const result = await this.client.query(String.raw`
      SELECT ${losslessSelectList("effectIndexArticles", publishedBlogIndexColumns)},
        CASE WHEN btrim(COALESCE("teaser", '')) <> '' THEN NULL ELSE left(
          btrim(regexp_replace(regexp_replace(regexp_replace(
            COALESCE((SELECT block FROM regexp_split_to_table("body_raw", '\n{2,}') WITH ORDINALITY AS b(block, position)
              WHERE block !~ '^\s*$' ORDER BY position LIMIT 1), ''),
            '\[([^\]]+)\]\([^)]*\)', '\1', 'g'), '[*_` + "`" + String.raw`#>]', '', 'g'), '\s+', ' ', 'g')),
          256
        ) END AS excerpt_source
      FROM "effectIndexArticles"
      WHERE "status" IS DISTINCT FROM 'draft' AND "publication_status" = 'published'
        AND "kind" = 'blog'
      ORDER BY "_creationTime" ASC, "_id" ASC
    `);
    return result.rows.map((row) => ({
      ...fromProjectedRow("effectIndexArticles", publishedBlogIndexColumns, row),
      excerpt_source: typeof row.excerpt_source === "string" ? row.excerpt_source : null,
    }));
  }

  async getPublicTripReportPreviewsBySubstanceNames(names: readonly string[]): Promise<PublicTripReportPreviewRow[]> {
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
    const rows = result.rows as PublicTripReportPreviewRow[];
    return indexReady
      ? rows
      : rows.filter((report) =>
          report.substances.some((substance) => lowerNames.has(substance.name.toLowerCase())),
        );
  }
}
