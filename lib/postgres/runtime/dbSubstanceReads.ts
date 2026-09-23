/**
 * Targeted `substanceIndex` projections. This is the base of the reader
 * chain in `db.ts` and owns the transaction executor the other layers share.
 */

import { decodeDocumentValue, encodeDocumentValue, losslessSelectList } from "../documentCodec";
import { fromRow, type Doc, type SqlExecutor } from "./dbRows";

export class SubstanceProjectionReader {
  constructor(protected readonly client: SqlExecutor) {}

  async getAboutAggregateSubstanceRows(): Promise<Doc[]> {
    const fields = [
      "_id", "_creationTime", "id", "title", "slug", "priority",
      "index_categories", "identification", "classification", "pharmacology",
    ];
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", fields)}
       FROM "substanceIndex"
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC`,
    );
    return result.rows.map((row) => fromRow("substanceIndex", row));
  }

  async getPublicSubstanceMechanismRows(): Promise<Doc[]> {
    const fields = [
      "_id", "_creationTime", "title", "slug", "priority",
      "index_categories", "identification", "pharmacology",
    ];
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", fields)}
       FROM "substanceIndex"
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC`,
    );
    return result.rows.map((row) => fromRow("substanceIndex", row));
  }

  async getPublicAboutPreviewRows(limit: number): Promise<Doc[]> {
    const bounded = Math.min(Math.max(Math.floor(limit), 1), 12);
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex")}
       FROM "substanceIndex"
       WHERE COALESCE(to_jsonb("priority") #>> '{}', 'normal') NOT IN ('low', 'hide_for_now')
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC
       LIMIT $1`,
      [bounded],
    );
    return result.rows.map((row) => fromRow("substanceIndex", row));
  }

  async getPublicSubstanceLookupPage(cursor: string | undefined, limit: number) {
    const after = cursor ? (decodeDocumentValue(JSON.parse(cursor)) as { _creationTime: number; _id: string }) : null;
    const params: unknown[] = [];
    const where = after
      ? (params.push(after._creationTime, after._id), 'WHERE ("_creationTime", "_id") > ($1, $2)')
      : "";
    params.push(limit + 1);
    const result = await this.client.query(
      `SELECT "_id", "_creationTime", "title", "slug", "priority" FROM "substanceIndex" ${where} ORDER BY "_creationTime" ASC, "_id" ASC LIMIT $${params.length}`,
      params,
    );
    const page = result.rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      rows: page.map((row) => ({ title: row.title, slug: row.slug ?? undefined, priority: row.priority })),
      cursor: last
        ? JSON.stringify(encodeDocumentValue({ _creationTime: last._creationTime, _id: last._id }))
        : (cursor ?? ""),
      isDone: result.rows.length <= limit,
    };
  }

  async getPublicSubstancePreviewsPage(cursor: string | undefined, limit: number) {
    const after = cursor ? (decodeDocumentValue(JSON.parse(cursor)) as { _creationTime: number; _id: string }) : null;
    const params: unknown[] = [];
    const where = after
      ? (params.push(after._creationTime, after._id), 'WHERE ("_creationTime", "_id") > ($1, $2)')
      : "";
    params.push(limit + 1);
    const result = await this.client.query(
      `SELECT "_id", "_creationTime", "title", "slug", "summary", "priority", "index_categories" FROM "substanceIndex" ${where} ORDER BY "_creationTime" ASC, "_id" ASC LIMIT $${params.length}`,
      params,
    );
    const page = result.rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      rows: page.map((row) => ({
        title: row.title,
        slug: row.slug ?? undefined,
        summary: row.summary,
        priority: row.priority,
        index_categories: row.index_categories,
      })),
      cursor: last
        ? JSON.stringify(encodeDocumentValue({ _creationTime: last._creationTime, _id: last._id }))
        : (cursor ?? ""),
      isDone: result.rows.length <= limit,
    };
  }

  async getPublicSubstanceEffectMembershipPage(cursor: string | undefined, limit: number) {
    const decoded = cursor ? (decodeDocumentValue(JSON.parse(cursor)) as { _creationTime?: number; _id?: string }) : null;
    // Generic paginate emits "{}" for an empty initial page; retain its cursor contract.
    const after = decoded?._creationTime != null && decoded._id != null ? decoded : null;
    const params: unknown[] = [];
    const where = after
      ? (params.push(after._creationTime, after._id), 'WHERE ("_creationTime", "_id" COLLATE "C") > ($1, $2::text COLLATE "C")')
      : "";
    params.push(limit + 1);
    // Keep nested effect groups intact, but never fetch article prose or provenance.
    // JSONB must be selected as text so the document codec preserves nulls and wrappers.
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", [
        "_id", "_creationTime", "id", "title", "slug", "priority",
        "index_categories", "identification", "classification", "subjective_effects",
      ])} FROM "substanceIndex" ${where} ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC LIMIT $${params.length}`,
      params,
    );
    const page = result.rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      rows: page.map((row) => fromRow("substanceIndex", row)),
      cursor: last
        ? JSON.stringify(encodeDocumentValue({ _creationTime: last._creationTime, _id: last._id }))
        : (cursor || "{}"),
      isDone: result.rows.length <= limit,
    };
  }

  async getPublicSubstanceSlugsPage(cursor: string | undefined, limit: number) {
    const unstored = cursor
      ? []
      : (await this.client.query(
          'SELECT "title", "slug" FROM "substanceIndex" WHERE "slug" IS NULL ORDER BY "_creationTime" ASC, "_id" ASC',
        )).rows;
    const params: unknown[] = [];
    const where = cursor ? (params.push(cursor), 'WHERE "slug" > $1') : 'WHERE "slug" IS NOT NULL';
    params.push(limit + 1);
    const stored = await this.client.query(
      `SELECT "title", "slug" FROM "substanceIndex" ${where} ORDER BY "slug" ASC, "_creationTime" ASC, "_id" ASC LIMIT $${params.length}`,
      params,
    );
    const storedPage = stored.rows.slice(0, limit);
    return {
      rows: [...unstored, ...storedPage].map((row) => ({
        title: row.title,
        slug: row.slug ?? undefined,
      })),
      cursor: stored.rows.length <= limit ? "" : storedPage[storedPage.length - 1]?.slug as string,
      isDone: stored.rows.length <= limit,
    };
  }

  async getPublicSubstanceSlugsByCandidates(candidates: readonly string[]): Promise<Doc[]> {
    if (candidates.length === 0) return [];
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", ["_id", "_creationTime", "title", "slug"])}
       FROM "substanceIndex"
       WHERE "slug" = ANY($1::text[]) OR "slug" IS NULL OR "slug" = ''
       ORDER BY "_creationTime" ASC, "_id" ASC`,
      [candidates],
    );
    return result.rows.map((row) => fromRow("substanceIndex", row));
  }

  async getPublicSubstanceCoveragePage(cursor: string | undefined, limit: number) {
    const after = cursor ? (decodeDocumentValue(JSON.parse(cursor)) as { _creationTime: number; _id: string }) : null;
    const params: unknown[] = [];
    const where = after
      ? (params.push(after._creationTime, after._id), 'WHERE ("_creationTime", "_id" COLLATE "C") > ($1, $2::text COLLATE "C")')
      : "";
    params.push(limit + 1);
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", [
        "_id", "_creationTime", "title", "slug", "priority", "index_categories",
        "dosage", "duration", "subjective_effects", "pharmacology", "interactions",
        "tolerance", "harm_potential", "history_culture", "legality",
        "references", "source_citations", "citations", "editorial_review",
      ])} FROM "substanceIndex" ${where}
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC LIMIT $${params.length}`,
      params,
    );
    const page = result.rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      rows: page.map((row) => fromRow("substanceIndex", row)),
      cursor: last
        ? JSON.stringify(encodeDocumentValue({ _creationTime: last._creationTime, _id: last._id }))
        : (cursor ?? ""),
      isDone: result.rows.length <= limit,
    };
  }
}
