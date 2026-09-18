import "server-only";
import type { SqlExecutor } from "../postgres/runtime/db";
import { rowToDocument, losslessSelectList } from "../postgres/documentCodec";
import { normalizePublicEffectIndexArticle } from "../data/publicData.publicationProjection";
import { extractSegments } from "../../scripts/translation/segment-manifest.mjs";
import { LIBRARY_TRANSLATION_CORPUS, projectLocalizedPublicationIndex } from "./publicationIndexProjection";
import type { ArticleIndexEntry } from "../../src/features/articles/domain/articlesIndex";

type IndexSqlClient = Pick<SqlExecutor, "query">;
type PendingIndex = { locale: string; publication_id: string; source_revision: string };

/** The SQL migration's BEFORE triggers take the same transaction lock. */
export async function lockLocalizedPublicationIndexes(client: IndexSqlClient): Promise<void> {
  const result = await client.query(
    'UPDATE "localizedPublicationIndexState" SET "revision" = "revision" + 1 WHERE "key" = $1',
    ["all"],
  );
  if (result.rowCount !== 1) throw new Error("Localized publication index producer state is not initialized");
}

/** Call inside the producer's transaction, never from a public read. */
export async function refreshLocalizedPublicationIndexes(client: IndexSqlClient, locale?: string): Promise<number> {
  await lockLocalizedPublicationIndexes(client);
  const pending = await client.query(
    'SELECT "locale", "publication_id", "source_revision" FROM "localizedPublicationIndexes" WHERE "dirty" AND ($1::text IS NULL OR "locale" = $1) ORDER BY "publication_id", "locale" FOR UPDATE',
    [locale ?? null],
  );
  for (const row of pending.rows as PendingIndex[]) {
    const source = await client.query(`SELECT ${losslessSelectList("effectIndexArticles")} FROM "effectIndexArticles" WHERE "_id" = $1`, [row.publication_id]);
    const article = source.rows[0] ? normalizePublicEffectIndexArticle(rowToDocument("effectIndexArticles", source.rows[0])) : null;
    if (!article || article.publication_status !== "published" || article.kind === "blog") {
      await client.query('DELETE FROM "localizedPublicationIndexes" WHERE "locale" = $1 AND "publication_id" = $2', [row.locale, row.publication_id]);
      continue;
    }
    const hashes = [...new Set<string>(extractSegments({ items: [article] }, LIBRARY_TRANSLATION_CORPUS).segments.map((segment) => segment.hash))];
    const stored = await client.query(
      'SELECT "hash", "target" FROM "translationSegments" WHERE "locale" = $1 AND "hash" = ANY($2::text[])', [row.locale, hashes],
    );
    const projection = projectLocalizedPublicationIndex(article, row.locale, new Map(
      stored.rows.map((segment) => [segment.hash as string, segment.target as string]),
    ));
    const result = await client.query(
      `UPDATE "localizedPublicationIndexes" SET "title" = $4, "short_description" = $5,
       "index_description" = $6, "read_minutes" = $7, "dependency_hashes" = $8,
       "overlay_revision" = $9, "dirty" = false
       WHERE "locale" = $1 AND "publication_id" = $2 AND "source_revision" = $3 AND "dirty"`,
      [row.locale, row.publication_id, row.source_revision, projection.title, projection.shortDescription ?? null,
        projection.indexDescription ?? null, projection.readMinutes ?? null, projection.dependencyHashes, projection.overlayRevision],
    );
    if (result.rowCount !== 1) throw new Error("Localized publication index source revision changed during materialization");
  }
  return pending.rows.length;
}

/** One compact snapshot query; no English or translated narrative crosses the connection. */
export async function readLocalizedPublicationIndex(client: IndexSqlClient, locale: string): Promise<ArticleIndexEntry[]> {
  type IndexRow = {
    slug: string; tags: string[]; publicationDate: string | null; kind: "article" | "blog" | null;
    bodyFormat: "markdown" | "vcode" | null; title: string | null; short_description: string | null;
    index_description: string | null; read_minutes: number | null; dirty: boolean | null; overlay_revision: string | null;
  };
  const result = await client.query(`SELECT p."slug", p."tags", p."publicationDate", p."kind", p."bodyFormat",
      i."title", i."short_description", i."index_description", i."read_minutes", i."dirty", i."overlay_revision"
    FROM "effectIndexArticles" p LEFT JOIN "localizedPublicationIndexes" i
      ON i."publication_id" = p."_id" AND i."locale" = $1
    WHERE p."status" IS DISTINCT FROM 'draft' AND p."publication_status" = 'published'
      AND p."kind" IS DISTINCT FROM 'blog'
    ORDER BY p."_creationTime" ASC, p."_id" ASC`, [locale]);
  return (result.rows as IndexRow[]).map((row) => {
    if (row.dirty !== false || row.title === null || row.overlay_revision === null) {
      throw new Error(`Localized publication index is not ready for ${locale}/${row.slug}; run the approved backfill before release`);
    }
    return {
      slug: row.slug, title: row.title, tags: row.tags,
      shortDescription: row.short_description ?? undefined, indexDescription: row.index_description ?? undefined,
      readMinutes: row.read_minutes ?? undefined, publicationDate: row.publicationDate ?? undefined,
      kind: row.kind ?? undefined, bodyFormat: row.bodyFormat ?? undefined,
    };
  });
}
