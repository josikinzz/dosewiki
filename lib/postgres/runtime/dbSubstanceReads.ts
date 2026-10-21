import { decodeDocumentValue, encodeDocumentValue, losslessSelectList } from "../documentCodec";
import type { Doc } from "./dataModel";
import { fromProjectedRow, fromTableRow, quote, type SqlExecutor, type StoredRow } from "./dbRows";
import {
  aboutAggregateSubstanceColumns,
  publicSubstanceCoverageColumns,
  publicSubstanceEffectMembershipColumns,
  publicSubstanceLibraryInputColumns,
  publicSubstanceLibraryInputNarrowedColumns,
  publicSubstanceLookupColumns,
  publicSubstanceMechanismColumns,
  publicSubstancePreviewColumns,
  publicSubstanceSlugCandidateColumns,
  publicSubstanceSlugColumns,
  type AboutAggregateSubstanceRow,
  type PublicSubstanceCoverageRow,
  type PublicSubstanceEffectMembershipRow,
  type PublicSubstanceLibraryInputRow,
  type PublicSubstanceLookupRow,
  type PublicSubstanceMechanismRow,
  type PublicSubstancePage,
  type PublicSubstancePreviewRow,
  type PublicSubstanceSlugCandidateRow,
  type PublicSubstanceSlugRow,
  type SubstanceProjectionReads,
} from "./projectionReads";

const publicSubstanceLibraryInputDecodedColumns = [
  ...publicSubstanceLibraryInputColumns,
  ...publicSubstanceLibraryInputNarrowedColumns,
] as const;

export class SubstanceProjectionReader implements SubstanceProjectionReads {
  constructor(protected readonly client: SqlExecutor) {}

  async getAboutAggregateSubstanceRows(): Promise<AboutAggregateSubstanceRow[]> {
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", aboutAggregateSubstanceColumns)}
       FROM "substanceIndex"
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC`,
    );
    return result.rows.map((row) => fromProjectedRow("substanceIndex", aboutAggregateSubstanceColumns, row));
  }

  async getPublicSubstanceMechanismRows(): Promise<PublicSubstanceMechanismRow[]> {
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", publicSubstanceMechanismColumns)}
       FROM "substanceIndex"
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC`,
    );
    return result.rows.map((row) => fromProjectedRow("substanceIndex", publicSubstanceMechanismColumns, row));
  }

  async getPublicAboutPreviewRows(limit: number): Promise<Doc<"substanceIndex">[]> {
    const bounded = Math.min(Math.max(Math.floor(limit), 1), 12);
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex")}
       FROM "substanceIndex"
       WHERE COALESCE(to_jsonb("priority") #>> '{}', 'normal') NOT IN ('low', 'hide_for_now')
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC
       LIMIT $1`,
      [bounded],
    );
    return result.rows.map((row) => fromTableRow("substanceIndex", row));
  }

  async getPublicSubstanceLookupPage(cursor: string | undefined, limit: number): Promise<PublicSubstancePage<PublicSubstanceLookupRow>> {
    const after = cursor ? (decodeDocumentValue(JSON.parse(cursor)) as { _creationTime: number; _id: string }) : null;
    const params: unknown[] = [];
    const where = after
      ? (params.push(after._creationTime, after._id), 'WHERE ("_creationTime", "_id") > ($1, $2)')
      : "";
    params.push(limit + 1);
    const result = await this.client.query(
      `SELECT "_id", "_creationTime", ${publicSubstanceLookupColumns.map(quote).join(", ")} FROM "substanceIndex" ${where} ORDER BY "_creationTime" ASC, "_id" ASC LIMIT $${params.length}`,
      params,
    );
    const page = (result.rows as StoredRow<"substanceIndex", "_id" | "_creationTime" | keyof PublicSubstanceLookupRow>[]).slice(0, limit);
    const last = page[page.length - 1];
    return {
      rows: page.map((row) => ({ title: row.title, slug: row.slug ?? undefined, priority: row.priority })),
      cursor: last
        ? JSON.stringify(encodeDocumentValue({ _creationTime: last._creationTime, _id: last._id }))
        : (cursor ?? ""),
      isDone: result.rows.length <= limit,
    };
  }

  async getPublicSubstancePreviewsPage(cursor: string | undefined, limit: number): Promise<PublicSubstancePage<PublicSubstancePreviewRow>> {
    const after = cursor ? (decodeDocumentValue(JSON.parse(cursor)) as { _creationTime: number; _id: string }) : null;
    const params: unknown[] = [];
    const where = after
      ? (params.push(after._creationTime, after._id), 'WHERE ("_creationTime", "_id") > ($1, $2)')
      : "";
    params.push(limit + 1);
    const result = await this.client.query(
      `SELECT "_id", "_creationTime", ${publicSubstancePreviewColumns.map(quote).join(", ")} FROM "substanceIndex" ${where} ORDER BY "_creationTime" ASC, "_id" ASC LIMIT $${params.length}`,
      params,
    );
    const page = (result.rows as StoredRow<"substanceIndex", "_id" | "_creationTime" | keyof PublicSubstancePreviewRow>[]).slice(0, limit);
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

  async getPublicSubstanceEffectMembershipPage(
    cursor: string | undefined,
    limit: number,
  ): Promise<PublicSubstancePage<PublicSubstanceEffectMembershipRow>> {
    const decoded = cursor ? (decodeDocumentValue(JSON.parse(cursor)) as { _creationTime?: number; _id?: string }) : null;
    const after = decoded?._creationTime != null && decoded._id != null ? decoded : null;
    const params: unknown[] = [];
    const where = after
      ? (params.push(after._creationTime, after._id), 'WHERE ("_creationTime", "_id" COLLATE "C") > ($1, $2::text COLLATE "C")')
      : "";
    params.push(limit + 1);
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", publicSubstanceEffectMembershipColumns)} FROM "substanceIndex" ${where} ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC LIMIT $${params.length}`,
      params,
    );
    const page = result.rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      rows: page.map((row) => fromProjectedRow("substanceIndex", publicSubstanceEffectMembershipColumns, row)),
      cursor: last
        ? JSON.stringify(encodeDocumentValue({ _creationTime: last._creationTime, _id: last._id }))
        : (cursor || "{}"),
      isDone: result.rows.length <= limit,
    };
  }

  async getPublicSubstanceLibraryInputPage(
    cursor: string | undefined,
    limit: number,
  ): Promise<PublicSubstancePage<PublicSubstanceLibraryInputRow>> {
    let after: { _creationTime: number; _id: string } | undefined;
    if (cursor) {
      try {
        const decoded = decodeDocumentValue(JSON.parse(cursor));
        if (!decoded || typeof decoded !== "object" || Array.isArray(decoded) ||
            !("_id" in decoded) || typeof decoded._id !== "string" || !/^[a-z0-9]{32}$/.test(decoded._id) ||
            !("_creationTime" in decoded) || typeof decoded._creationTime !== "number" || !Number.isFinite(decoded._creationTime)) {
          throw new Error("Invalid pagination cursor");
        }
        after = { _creationTime: decoded._creationTime, _id: decoded._id };
      } catch { throw new Error("Invalid pagination cursor"); }
    }
    const params: unknown[] = [];
    const where = after
      ? (params.push(after._creationTime, after._id), 'WHERE ("_creationTime", "_id" COLLATE "C") > ($1::double precision, $2::text COLLATE "C")')
      : "";
    params.push(limit + 1);
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", publicSubstanceLibraryInputColumns)},
       (CASE WHEN jsonb_typeof("harm_potential") = 'object'
         THEN jsonb_build_object('addiction_liability', "harm_potential"->'addiction_liability')
         ELSE "harm_potential" END)::text AS "harm_potential",
       (CASE WHEN jsonb_typeof("editorial_review") = 'object'
         THEN jsonb_build_object('status', "editorial_review"->'status')
         ELSE "editorial_review" END)::text AS "editorial_review"
       FROM "substanceIndex" ${where}
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC LIMIT $${params.length}`,
      params,
    );
    const page = result.rows.slice(0, limit)
      .map((row) => fromProjectedRow("substanceIndex", publicSubstanceLibraryInputDecodedColumns, row));
    const last = page[page.length - 1] ?? after;
    return {
      rows: page,
      cursor: JSON.stringify(encodeDocumentValue(last
        ? { _creationTime: last._creationTime, _id: last._id }
        : {})),
      isDone: result.rows.length <= limit,
    };
  }

  async getPublicSubstanceSlugsPage(cursor: string | undefined, limit: number): Promise<PublicSubstancePage<PublicSubstanceSlugRow>> {
    const columns = publicSubstanceSlugColumns.map(quote).join(", ");
    const unstored = cursor
      ? []
      : (await this.client.query(
          `SELECT ${columns} FROM "substanceIndex" WHERE "slug" IS NULL ORDER BY "_creationTime" ASC, "_id" ASC`,
        )).rows;
    const params: unknown[] = [];
    const where = cursor ? (params.push(cursor), 'WHERE "slug" > $1') : 'WHERE "slug" IS NOT NULL';
    params.push(limit + 1);
    const stored = await this.client.query(
      `SELECT ${columns} FROM "substanceIndex" ${where} ORDER BY "slug" ASC, "_creationTime" ASC, "_id" ASC LIMIT $${params.length}`,
      params,
    );
    const storedPage = stored.rows.slice(0, limit);
    return {
      rows: ([...unstored, ...storedPage] as StoredRow<"substanceIndex", keyof PublicSubstanceSlugRow>[]).map((row) => ({
        title: row.title,
        slug: row.slug ?? undefined,
      })),
      cursor: stored.rows.length <= limit ? "" : storedPage[storedPage.length - 1]?.slug as string,
      isDone: stored.rows.length <= limit,
    };
  }

  async getPublicSubstanceSlugsByCandidates(candidates: readonly string[]): Promise<PublicSubstanceSlugCandidateRow[]> {
    if (candidates.length === 0) return [];
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", publicSubstanceSlugCandidateColumns)}
       FROM "substanceIndex"
       WHERE "slug" = ANY($1::text[]) OR "slug" IS NULL OR "slug" = ''
       ORDER BY "_creationTime" ASC, "_id" ASC`,
      [candidates],
    );
    return result.rows.map((row) => fromProjectedRow("substanceIndex", publicSubstanceSlugCandidateColumns, row));
  }

  async getPublicSubstanceCoveragePage(cursor: string | undefined, limit: number): Promise<PublicSubstancePage<PublicSubstanceCoverageRow>> {
    const after = cursor ? (decodeDocumentValue(JSON.parse(cursor)) as { _creationTime: number; _id: string }) : null;
    const params: unknown[] = [];
    const where = after
      ? (params.push(after._creationTime, after._id), 'WHERE ("_creationTime", "_id" COLLATE "C") > ($1, $2::text COLLATE "C")')
      : "";
    params.push(limit + 1);
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", publicSubstanceCoverageColumns)} FROM "substanceIndex" ${where}
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC LIMIT $${params.length}`,
      params,
    );
    const page = result.rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      rows: page.map((row) => fromProjectedRow("substanceIndex", publicSubstanceCoverageColumns, row)),
      cursor: last
        ? JSON.stringify(encodeDocumentValue({ _creationTime: last._creationTime, _id: last._id }))
        : (cursor ?? ""),
      isDone: result.rows.length <= limit,
    };
  }
}
