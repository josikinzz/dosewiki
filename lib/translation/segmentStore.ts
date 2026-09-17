/**
 * Postgres access for the two runtime-owned translation tables
 * (`lib/postgres/schema.runtime.ts`). Segments are keyed by the English text's
 * content hash so a read is one `= ANY($hashes)` lookup and a refresh only
 * translates hashes that are missing. Jobs are an outbox with a lease: an
 * editorial write upserts, the cron claims, and completion clears the row.
 */
import "server-only";

import { getPostgresClient } from "@server/postgres/runtime/backend";
import { glossaryTermPattern } from "../../scripts/translation/locales.mjs";
import { assertDataWritesNotFrozen } from "../runtime/dataWriteFreeze";
import { refreshLocalizedPublicationIndexes } from "./publicationIndexStore";
import { patchDocument, selectDocumentById, type SqlClient } from "../postgres/documentStore";

export type TranslationSegmentRow = {
  locale: string;
  hash: string;
  source: string;
  target: string;
  model: string;
  prompt_version: string;
};

export type TranslationJobRow = {
  locale: string;
  slug: string;
  attempts: number;
  requested_at: string;
  claimed_at: string;
};

/** A stale lease is retaken after this long; the cron's own budget is shorter. */
const JOB_LEASE_MS = 10 * 60 * 1000;
const MAX_JOB_ATTEMPTS = 5;

/** `hash -> target` for every stored segment among `hashes`. */
export async function readTranslations(locale: string, hashes: readonly string[]): Promise<Map<string, string>> {
  if (hashes.length === 0) return new Map();
  const rows = await getPostgresClient().sql<{ hash: string; target: string }>(
    'SELECT "hash", "target" FROM "translationSegments" WHERE "locale" = $1 AND "hash" = ANY($2::text[])',
    [locale, [...hashes]],
  );
  return new Map(rows.map((row) => [row.hash, row.target]));
}

/** Hashes among `hashes` with no stored row for `locale`. */
export async function missingTranslationHashes(locale: string, hashes: readonly string[]): Promise<string[]> {
  const stored = await readTranslations(locale, hashes);
  return hashes.filter((hash) => !stored.has(hash));
}

/** Hashes among `hashes` with no row, or a row stamped with another prompt digest: what a record refresh sends to the model. */
export async function pendingTranslationHashes(locale: string, hashes: readonly string[], promptVersion: string): Promise<string[]> {
  if (hashes.length === 0) return [];
  const rows = await getPostgresClient().sql<{ hash: string }>(
    'SELECT "hash" FROM "translationSegments" WHERE "locale" = $1 AND "hash" = ANY($2::text[]) AND "prompt_version" = $3',
    [locale, [...hashes], promptVersion],
  );
  const current = new Set(rows.map((row) => row.hash));
  return hashes.filter((hash) => !current.has(hash));
}

/** Insert or replace segments; a replaced row is a deliberate retranslation. */
export async function writeTranslations(rows: readonly TranslationSegmentRow[]): Promise<void> {
  if (rows.length === 0) return;
  assertDataWritesNotFrozen("writeTranslations");
  const now = Date.now();
  await getPostgresClient().sqlTransaction(async (client) => {
    await client.query(
    `INSERT INTO "translationSegments" ("locale", "hash", "source", "target", "model", "prompt_version", "created_at")
     SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::bigint[])
     ON CONFLICT ("locale", "hash") DO UPDATE SET
       "source" = EXCLUDED."source", "target" = EXCLUDED."target", "model" = EXCLUDED."model",
       "prompt_version" = EXCLUDED."prompt_version", "created_at" = EXCLUDED."created_at"`,
    [
      rows.map((row) => row.locale),
      rows.map((row) => row.hash),
      rows.map((row) => row.source),
      rows.map((row) => row.target),
      rows.map((row) => row.model),
      rows.map((row) => row.prompt_version),
      rows.map(() => now),
    ],
  );
    await refreshLocalizedPublicationIndexes(client);
  });
}

export type TranslationRejectionRow = {
  locale: string;
  hash: string;
  source: string;
  defects: string[];
  attempts: number;
  last_tried_at: number;
};

/** Record the units the model failed; a unit that later stores is cleared by `writeTranslations`' caller. */
export async function writeTranslationRejections(
  rows: readonly Pick<TranslationRejectionRow, "locale" | "hash" | "source" | "defects">[],
): Promise<void> {
  if (rows.length === 0) return;
  assertDataWritesNotFrozen("writeTranslationRejections");
  const now = Date.now();
  await getPostgresClient().sql(
    `INSERT INTO "translationRejections" ("locale", "hash", "source", "defects", "attempts", "last_tried_at")
     SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::int[], $6::bigint[])
     ON CONFLICT ("locale", "hash") DO UPDATE SET
       "defects" = EXCLUDED."defects", "attempts" = "translationRejections"."attempts" + 1, "last_tried_at" = EXCLUDED."last_tried_at"`,
    [
      rows.map((row) => row.locale),
      rows.map((row) => row.hash),
      rows.map((row) => row.source),
      rows.map((row) => row.defects.join(",")),
      rows.map(() => 1),
      rows.map(() => now),
    ],
  );
}

export async function clearTranslationRejections(locale: string, hashes: readonly string[]): Promise<void> {
  if (hashes.length === 0) return;
  assertDataWritesNotFrozen("clearTranslationRejections");
  await getPostgresClient().sql('DELETE FROM "translationRejections" WHERE "locale" = $1 AND "hash" = ANY($2::text[])', [locale, [...hashes]]);
}

/** `hash -> rejection` among `hashes`; an empty `hashes` reads every rejection for the locale. */
export async function readTranslationRejections(locale: string, hashes?: readonly string[]): Promise<Map<string, TranslationRejectionRow>> {
  if (hashes?.length === 0) return new Map();
  const rows = await getPostgresClient().sql<Omit<TranslationRejectionRow, "defects"> & { defects: string }>(
    hashes
      ? 'SELECT * FROM "translationRejections" WHERE "locale" = $1 AND "hash" = ANY($2::text[])'
      : 'SELECT * FROM "translationRejections" WHERE "locale" = $1',
    hashes ? [locale, [...hashes]] : [locale],
  );
  return new Map(rows.map((row) => [row.hash, { ...row, defects: row.defects.split(",").filter(Boolean) }]));
}

/** Rows whose prompt digest differs from the current one; the backfill script retranslates them. */
export async function readStaleTranslationHashes(locale: string, promptVersion: string): Promise<string[]> {
  const rows = await getPostgresClient().sql<{ hash: string }>(
    'SELECT "hash" FROM "translationSegments" WHERE "locale" = $1 AND "prompt_version" <> $2',
    [locale, promptVersion],
  );
  return rows.map((row) => row.hash);
}

/** How many segments the locale stores and how many carry the current digest; the rest are due for a stale replay. */
export async function translationSegmentCounts(locale: string, promptVersion: string): Promise<{ total: number; current: number }> {
  const [row] = await getPostgresClient().sql<{ n: string; current: string }>(
    'SELECT COUNT(*)::text AS n, COUNT(*) FILTER (WHERE "prompt_version" = $2)::text AS current FROM "translationSegments" WHERE "locale" = $1',
    [locale, promptVersion],
  );
  return { total: Number(row?.n ?? 0), current: Number(row?.current ?? 0) };
}

/**
 * Stored rows whose English mentions any of `terms`, by the matcher the
 * prompt builder injects glossary lines with (whole word, case insensitive).
 * The database narrows by substring; the regex decides.
 */
export async function readTranslationsMentioning(locale: string, terms: readonly string[]): Promise<Array<{ hash: string; source: string }>> {
  const matched = new Map<string, { hash: string; source: string }>();
  for (const term of terms) {
    const pattern = glossaryTermPattern(term);
    const rows = await getPostgresClient().sql<{ hash: string; source: string }>(
      'SELECT "hash", "source" FROM "translationSegments" WHERE "locale" = $1 AND "source" ILIKE $2',
      [locale, `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`],
    );
    for (const row of rows) if (pattern.test(row.source)) matched.set(row.hash, row);
  }
  return [...matched.values()];
}

/** A digest no run ever produces; a row carrying it is stale whatever the current digest is. */
const STALE_MARK = "stale";

/**
 * Narrow "stale" to `hashes` after a glossary edit: those rows are marked for
 * replay, and every other row on an older digest is restamped with the
 * current one. The restamp is exact, not a shortcut: a glossary line is only
 * injected into a prompt whose segment mentions the term, so a segment that
 * does not mention it receives a byte-identical prompt under the new digest.
 */
export async function scopeStaleTranslations(
  locale: string,
  hashes: readonly string[],
  promptVersion: string,
): Promise<{ marked: number; restamped: number }> {
  assertDataWritesNotFrozen("scopeStaleTranslations");
  const marked = await getPostgresClient().sql<{ hash: string }>(
    'UPDATE "translationSegments" SET "prompt_version" = $3 WHERE "locale" = $1 AND "hash" = ANY($2::text[]) RETURNING "hash"',
    [locale, [...hashes], STALE_MARK],
  );
  const restamped = await getPostgresClient().sql<{ hash: string }>(
    'UPDATE "translationSegments" SET "prompt_version" = $2 WHERE "locale" = $1 AND "prompt_version" <> $2 AND "prompt_version" <> $3 RETURNING "hash"',
    [locale, promptVersion, STALE_MARK],
  );
  return { marked: marked.length, restamped: restamped.length };
}

/**
 * Mark records as needing a locale refresh. The request timestamp is also a
 * strictly increasing generation, even for repeated requests in one millisecond.
 */
export async function enqueueTranslationJobs(
  locales: readonly string[],
  slugs: readonly string[],
  publication?: { id: string; generation: number },
): Promise<void> {
  if (locales.length === 0 || slugs.length === 0) return;
  assertDataWritesNotFrozen("enqueueTranslationJobs");
  const pairs = [...new Set(locales)].flatMap((locale) => [...new Set(slugs)].map((slug) => ({ locale, slug })));
  const enqueue = async (client: SqlClient) => {
    await client.query(
      `INSERT INTO "translationJobs" ("locale", "slug", "requested_at", "claimed_at", "completed_at", "attempts", "last_error")
       SELECT l, s, $3::bigint, NULL, NULL, 0, NULL FROM UNNEST($1::text[], $2::text[]) AS pending(l, s)
       ON CONFLICT ("locale", "slug") DO UPDATE SET
         "requested_at" = GREATEST(EXCLUDED."requested_at", "translationJobs"."requested_at" + 1),
         "claimed_at" = NULL, "completed_at" = NULL, "attempts" = 0, "last_error" = NULL`,
      [pairs.map((pair) => pair.locale), pairs.map((pair) => pair.slug), Date.now()],
    );
  };
  await getPostgresClient().sqlTransaction(async (client) => {
    if (!publication) return enqueue(client);
    // Lock the outbox generation and commit its receipt with the queue writes.
    // A crash or dispatch retry cannot reset active jobs for this generation.
    const row = await selectDocumentById(client, "publicCachePublications", publication.id, true);
    if (!row || row.generation !== publication.generation || !row.pending) return;
    const receipts = (row.receipts ?? []) as Array<{ target?: string; generation?: number }>;
    if (receipts.some((receipt) => receipt.target === "translation-queue" && receipt.generation === publication.generation)) return;
    await enqueue(client);
    await patchDocument(client, "publicCachePublications", publication.id, {
      receipts: [...receipts, { target: "translation-queue", generation: publication.generation,
        status: "accepted", attempts: 1, jobs: pairs.map(({ locale, slug }) => `${locale}/${slug}`) }],
    });
  });
}

/** Lease up to `limit` due rows to this worker. Atomic: concurrent crons never take the same row. */
export async function claimTranslationJobs(limit: number): Promise<TranslationJobRow[]> {
  assertDataWritesNotFrozen("claimTranslationJobs");
  const now = Date.now();
  return await getPostgresClient().sql<TranslationJobRow>(
    `UPDATE "translationJobs" SET "claimed_at" = $1::bigint, "attempts" = "attempts" + 1
     WHERE ("locale", "slug") IN (
       SELECT "locale", "slug" FROM "translationJobs"
       WHERE "completed_at" IS NULL AND "attempts" < $3::int AND ("claimed_at" IS NULL OR "claimed_at" < $1::bigint - $4::bigint)
       ORDER BY "requested_at" ASC LIMIT $2::int FOR UPDATE SKIP LOCKED
     )
     RETURNING "locale", "slug", "attempts", "requested_at"::text, "claimed_at"::text`,
    [now, limit, MAX_JOB_ATTEMPTS, JOB_LEASE_MS],
  );
}

async function finishTranslationJob(job: TranslationJobRow, error: string | null): Promise<boolean> {
  return getPostgresClient().sqlTransaction(async (client) => {
    const current = await client.query<TranslationJobRow & { completed_at: string | null }>(
      `SELECT "locale", "slug", "requested_at"::text, "claimed_at"::text, "attempts", "completed_at"::text
       FROM "translationJobs" WHERE "locale" = $1 AND "slug" = $2 FOR UPDATE`,
      [job.locale, job.slug],
    );
    const row = current.rows[0];
    if (!row || row.completed_at !== null || row.requested_at !== job.requested_at ||
        row.claimed_at !== job.claimed_at || row.attempts !== job.attempts) return false;
    await client.query(
      `UPDATE "translationJobs" SET "completed_at" = $3::bigint, "claimed_at" = NULL, "last_error" = $4
       WHERE "locale" = $1 AND "slug" = $2`,
      [job.locale, job.slug, error === null ? Date.now() : null, error],
    );
    return true;
  });
}

export async function completeTranslationJob(job: TranslationJobRow): Promise<boolean> {
  assertDataWritesNotFrozen("completeTranslationJob");
  return finishTranslationJob(job, null);
}

/** Release only this lease; the five-attempt cap leaves exhausted errors inspectable. */
export async function failTranslationJob(job: TranslationJobRow, error: string): Promise<boolean> {
  assertDataWritesNotFrozen("failTranslationJob");
  return finishTranslationJob(job, error.slice(0, 2000));
}
