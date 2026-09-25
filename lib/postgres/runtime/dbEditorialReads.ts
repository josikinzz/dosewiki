/** Targeted editor, studio, glossary, feedback, and citation projections. */

import { PUBLIC_GLOSSARY_RENDERING_SELECT, publicGlossaryRendering } from "../../translation/publicGlossaryRendering";
import { decodeDocumentValue, encodeDocumentValue, losslessSelectList } from "../documentCodec";
import type { CitationQueueSummary } from "../../../server/lib/citationQueueFilter";
import { PublicProjectionReader } from "./dbPublicReads";
import { fromRow, quote, type Doc } from "./dbRows";

export class EditorialProjectionReader extends PublicProjectionReader {
  async getStudioReplicationTotal(): Promise<number> {
    const result = await this.client.query(
      'SELECT count(*)::int AS "totalCount" FROM "replications"',
    );
    return Number(result.rows[0]?.totalCount ?? 0);
  }

  /**
   * Each article's latest recorded revision hash, the value a review sign-off
   * compares against. Only the two small columns are read, never the snapshots.
   */
  async getPublishedArticleRevisions(): Promise<Array<{ slug: string; revision: string }>> {
    const result = await this.client.query(
      `SELECT DISTINCT ON ("slug" COLLATE "C") "slug", "resultHash"
       FROM "articleRevisions"
       ORDER BY "slug" COLLATE "C", "_creationTime" DESC`,
    );
    return result.rows.flatMap((row) =>
      typeof row.slug === "string" && typeof row.resultHash === "string" && row.resultHash
        ? [{ slug: row.slug, revision: row.resultHash }]
        : [],
    );
  }

  async getEditorLibraryPage(args: { numItems: number; cursor: string | null }) {
    const after = args.cursor
      ? decodeDocumentValue(JSON.parse(args.cursor)) as { _creationTime: number; _id: string }
      : null;
    const limit = Math.min(Math.max(Math.floor(args.numItems), 1), 200);
    const params: unknown[] = [];
    const continuation = after
      ? (params.push(after._creationTime, after._id), 'WHERE (s."_creationTime", s."_id" COLLATE "C") > ($1, $2::text COLLATE "C")')
      : "";
    params.push(limit + 1);
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", [
        "_id", "_creationTime", "id", "slug", "title", "priority", "index_categories",
        "identification", "classification", "pharmacology", "subjective_effects", "editorial_review",
      ])}, (
        CASE WHEN jsonb_typeof(s."references") = 'array' THEN jsonb_array_length(s."references") ELSE 0 END
        + CASE WHEN jsonb_typeof(s."source_citations") = 'array' THEN jsonb_array_length(s."source_citations") ELSE 0 END
        + CASE WHEN jsonb_typeof(s."citations") = 'array' THEN jsonb_array_length(s."citations") ELSE 0 END
      )::int AS "referenceCount"
       FROM "substanceIndex" s ${continuation}
       ORDER BY s."_creationTime" ASC, s."_id" COLLATE "C" ASC
       LIMIT $${params.length}`,
      params,
    );
    const rows = result.rows.slice(0, limit);
    const last = rows[rows.length - 1];
    return {
      page: rows.map((row) => ({
        article: fromRow("substanceIndex", row),
        referenceCount: Number(row.referenceCount),
      })),
      continueCursor: last
        ? JSON.stringify(encodeDocumentValue({ _creationTime: last._creationTime, _id: last._id }))
        : (args.cursor ?? ""),
      isDone: result.rows.length <= limit,
    };
  }

  async getMoleculePickerPage(args: { numItems: number; cursor: string | null }) {
    const after = args.cursor
      ? decodeDocumentValue(JSON.parse(args.cursor)) as { _creationTime: number; _id: string }
      : null;
    const limit = Math.min(Math.max(Math.floor(args.numItems), 1), 200);
    const params: unknown[] = [];
    const continuation = after
      ? (params.push(after._creationTime, after._id), 'WHERE (s."_creationTime", s."_id" COLLATE "C") > ($1, $2::text COLLATE "C")')
      : "";
    params.push(limit + 1);
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", [
        "_id", "_creationTime", "slug", "title", "priority", "index_categories", "classification",
      ])}, EXISTS (
         SELECT 1 FROM "moleculeOverrides" m
         WHERE m."slug" COLLATE "C" = s."slug" COLLATE "C"
       ) AS "hasOverride"
       FROM "substanceIndex" s ${continuation}
       ORDER BY s."_creationTime" ASC, s."_id" COLLATE "C" ASC
       LIMIT $${params.length}`,
      params,
    );
    const rows = result.rows.slice(0, limit);
    const last = rows[rows.length - 1];
    return {
      page: rows.map((row) => ({
        article: fromRow("substanceIndex", row),
        hasOverride: row.hasOverride === true,
      })),
      continueCursor: last
        ? JSON.stringify(encodeDocumentValue({ _creationTime: last._creationTime, _id: last._id }))
        : (args.cursor ?? ""),
      isDone: result.rows.length <= limit,
    };
  }

  async getMoleculeSourceBySlug(slug: string): Promise<Doc | null> {
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", [
        "_id", "_creationTime", "slug", "title", "identification",
      ])}
       FROM "substanceIndex"
       WHERE "slug" COLLATE "C" = $1::text COLLATE "C"
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC
       LIMIT 2`,
      [slug],
    );
    if (result.rows.length !== 1) return null;
    return fromRow("substanceIndex", result.rows[0]);
  }

  async getMoleculeEditSourceBySlug(slug: string): Promise<Doc | null> {
    const result = await this.client.query(
      `SELECT ${losslessSelectList("moleculeOverrides", [
        "_id", "_creationTime", "slug", "molblock", "boldBonds", "source", "updatedAt",
      ])}
       FROM "moleculeOverrides"
       WHERE "slug" COLLATE "C" = $1::text COLLATE "C"
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC
       LIMIT 2`,
      [slug],
    );
    if (result.rows.length !== 1) return null;
    return fromRow("moleculeOverrides", result.rows[0]);
  }

  /** Snapshot reads share the mutation transaction, so concurrent glossary edits conflict. */
  async getGlossaryRendering(locale: string, term: string) {
    const result = await this.client.query(
      `${PUBLIC_GLOSSARY_RENDERING_SELECT} WHERE g."locale" = $1 AND g."term" = $2`, [locale, term],
    );
    const row = result.rows[0];
    return row ? publicGlossaryRendering(row) : null;
  }

  async getGlossaryReactionTotals(locale: string) {
    const result = await this.client.query(
      `SELECT "term", "target", "version", count(*) FILTER (WHERE "choice" = 'right')::int AS "right", count(*) FILTER (WHERE "choice" = 'improve')::int AS "improve"
       FROM (SELECT DISTINCT ON ("term", "version", "visitor") "term", "target", "version", "choice"
         FROM "glossaryReactionEvents" WHERE "locale" = $1
         ORDER BY "term", "version", "visitor", "created_at" DESC) latest
       GROUP BY "term", "target", "version" ORDER BY "term", "version"`, [locale],
    );
    return result.rows as Array<{ term: string; target: string; version: string; right: number; improve: number }>;
  }

  async getFeedbackCountByStatuses(
    table: "articleFeedback" | "siteFeedback",
    statuses: readonly string[],
  ): Promise<number> {
    if (statuses.length === 0) return 0;
    const result = await this.client.query(
      `SELECT count(*)::text AS "count" FROM ${quote(table)} WHERE (to_jsonb("status") #>> '{}') = ANY($1::text[])`,
      [statuses],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async getCitationEvidenceReviewRows(slug: string) {
    const fields = [
      "_id", "_creationTime", "slug", "section", "claimKey", "claimText", "fieldPath",
      "referenceIds", "status", "statusReason", "severity", "confidence",
      "supportingSnippet", "supportRationale", "supports", "diagnostics", "updatedAt",
    ] as const;
    const result = await this.client.query(
      `SELECT ${losslessSelectList("citationEvidence", fields)}
       FROM "citationEvidence"
       WHERE "slug" = $1
       ORDER BY "section" COLLATE "C" ASC, "claimKey" COLLATE "C" ASC, "_creationTime" ASC`,
      [slug],
    );
    return result.rows.map((row) => {
      const decoded = fromRow("citationEvidence", row);
      return Object.fromEntries(
        fields
          .filter((field) => field !== "_id" && field !== "_creationTime")
          .filter((field) => decoded[field] !== undefined)
          .map((field) => [field, decoded[field]]),
      );
    });
  }

  async getCitationQueueSummaries(): Promise<CitationQueueSummary[]> {
    const result = await this.client.query(
      `WITH ordered AS (
         SELECT e."_id", e."_creationTime", e.slug, e."articleId", e.section,
                e.status, e.severity, e.diagnostics, e."updatedAt",
                floor((row_number() OVER (
                  ORDER BY e."_creationTime" ASC, e."_id" COLLATE "C" ASC
                ) - 1) / 1000)::bigint AS page_number
         FROM "citationEvidence" e
       ),
       page_first AS (
         SELECT DISTINCT ON (slug COLLATE "C", page_number)
                slug, page_number, to_jsonb("articleId") #>> '{}' AS article_id
         FROM ordered
         ORDER BY slug COLLATE "C" ASC, page_number ASC, "_creationTime" ASC, "_id" COLLATE "C" ASC
       ),
       selected_article AS (
         SELECT DISTINCT ON (slug COLLATE "C") slug, article_id
         FROM page_first
         WHERE article_id IS NOT NULL
         ORDER BY slug COLLATE "C" ASC, page_number ASC
       )
       SELECT e.slug,
              a.article_id,
              count(*)::text AS total_rows,
              count(*) FILTER (WHERE to_jsonb(e.status) #>> '{}' = 'supported')::text AS supported_count,
              count(*) FILTER (WHERE to_jsonb(e.status) #>> '{}' = 'needs_source')::text AS needs_source_count,
              count(*) FILTER (WHERE to_jsonb(e.status) #>> '{}' = 'needs_review')::text AS needs_review_count,
              count(*) FILTER (WHERE to_jsonb(e.status) #>> '{}' = 'approved')::text AS approved_count,
              count(*) FILTER (WHERE to_jsonb(e.status) #>> '{}' = 'rejected')::text AS rejected_count,
              count(*) FILTER (WHERE to_jsonb(e.severity) #>> '{}' = 'blocking')::text AS blocking_count,
              count(*) FILTER (WHERE to_jsonb(e.severity) #>> '{}' = 'blocking' AND to_jsonb(e.status) #>> '{}' = 'needs_source')::text AS blocking_needs_source_count,
              count(*) FILTER (WHERE to_jsonb(e.severity) #>> '{}' = 'blocking' AND to_jsonb(e.status) #>> '{}' = 'needs_review')::text AS blocking_needs_review_count,
              count(*) FILTER (WHERE to_jsonb(e.severity) #>> '{}' = 'blocking' AND to_jsonb(e.status) #>> '{}' = 'supported')::text AS blocking_supported_count,
              count(*) FILTER (WHERE to_jsonb(e.severity) #>> '{}' = 'blocking' AND to_jsonb(e.status) #>> '{}' = 'rejected')::text AS blocking_rejected_count,
              coalesce(sum((
                SELECT count(*) FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(e.diagnostics) = 'array' THEN e.diagnostics ELSE '[]'::jsonb END
                ) diagnostic WHERE diagnostic ->> 'severity' = 'error'
              )), 0)::text AS diagnostic_error_count,
              coalesce(sum((
                SELECT count(*) FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(e.diagnostics) = 'array' THEN e.diagnostics ELSE '[]'::jsonb END
                ) diagnostic WHERE diagnostic ->> 'severity' IS DISTINCT FROM 'error'
              )), 0)::text AS diagnostic_warning_count,
              array_agg(DISTINCT e.section) AS section_ids,
              max(e."updatedAt") AS updated_at
       FROM ordered e
       LEFT JOIN selected_article a ON a.slug = e.slug
       GROUP BY e.slug, a.article_id`,
    );
    const count = (value: unknown) => Number(value ?? 0);
    return result.rows.map((row) => ({
      slug: row.slug as string,
      articleId: row.article_id == null ? null : Number(row.article_id),
      totalRows: count(row.total_rows),
      supportedCount: count(row.supported_count),
      needsSourceCount: count(row.needs_source_count),
      needsReviewCount: count(row.needs_review_count),
      approvedCount: count(row.approved_count),
      rejectedCount: count(row.rejected_count),
      blockingCount: count(row.blocking_count),
      blockingNeedsSourceCount: count(row.blocking_needs_source_count),
      blockingNeedsReviewCount: count(row.blocking_needs_review_count),
      blockingSupportedCount: count(row.blocking_supported_count),
      blockingRejectedCount: count(row.blocking_rejected_count),
      diagnosticErrorCount: count(row.diagnostic_error_count),
      diagnosticWarningCount: count(row.diagnostic_warning_count),
      sectionIds: row.section_ids as string[],
      updatedAt: row.updated_at as string | null,
    }));
  }

  async getReplicationPlaylistSummaryRows(ownerEmail?: string) {
    const params: unknown[] = [];
    const ownerFilter = ownerEmail === undefined
      ? ""
      : (params.push(ownerEmail), 'AND "owner_email" = $1');
    const result = await this.client.query(
      `SELECT "key", "title", jsonb_array_length("replication_slugs") AS "work_count",
              "updated_at", "updated_by", "owner_email"
       FROM "replicationPlaylists"
       WHERE coalesce("archived_at", '') = '' ${ownerFilter}`,
      params,
    );
    return result.rows as Array<{
      key: string;
      title: string;
      work_count: number;
      updated_at: string;
      updated_by: string | null;
      owner_email: string | null;
    }>;
  }
}
