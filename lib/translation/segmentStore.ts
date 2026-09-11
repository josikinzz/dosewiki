/**
 * Postgres access for the two runtime-owned translation tables
 * (`lib/postgres/schema.runtime.ts`). Segments are keyed by the English text's
 * content hash so a read is one `= ANY($hashes)` lookup and a refresh only
 * translates hashes that are missing. Jobs are an outbox with a lease: an
 * editorial write upserts, the cron claims, and completion clears the row.
 */
import "server-only";

import { getDataBackend, getPostgresConvexClient } from "@server/postgres/runtime/backend";

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
};

/** A stale lease is retaken after this long; the cron's own budget is shorter. */
const JOB_LEASE_MS = 10 * 60 * 1000;
const MAX_JOB_ATTEMPTS = 5;

function db() {
  return getPostgresConvexClient();
}

/** `hash -> target` for every stored segment among `hashes`. */
export async function readTranslations(locale: string, hashes: readonly string[]): Promise<Map<string, string>> {
  if (hashes.length === 0 || getDataBackend() !== "postgres") return new Map();
  const rows = await db().sql<{ hash: string; target: string }>(
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

/** Insert or replace segments; a replaced row is a deliberate retranslation. */
export async function writeTranslations(rows: readonly TranslationSegmentRow[]): Promise<void> {
  if (rows.length === 0) return;
  const now = Date.now();
  await db().sql(
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
  if (rows.length === 0 || getDataBackend() !== "postgres") return;
  const now = Date.now();
  await db().sql(
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
  if (hashes.length === 0 || getDataBackend() !== "postgres") return;
  await db().sql('DELETE FROM "translationRejections" WHERE "locale" = $1 AND "hash" = ANY($2::text[])', [locale, [...hashes]]);
}

/** `hash -> rejection` among `hashes`; an empty `hashes` reads every rejection for the locale. */
export async function readTranslationRejections(locale: string, hashes?: readonly string[]): Promise<Map<string, TranslationRejectionRow>> {
  if (getDataBackend() !== "postgres" || hashes?.length === 0) return new Map();
  const rows = await db().sql<Omit<TranslationRejectionRow, "defects"> & { defects: string }>(
    hashes
      ? 'SELECT * FROM "translationRejections" WHERE "locale" = $1 AND "hash" = ANY($2::text[])'
      : 'SELECT * FROM "translationRejections" WHERE "locale" = $1',
    hashes ? [locale, [...hashes]] : [locale],
  );
  return new Map(rows.map((row) => [row.hash, { ...row, defects: row.defects.split(",").filter(Boolean) }]));
}

/** Rows whose prompt digest differs from the current one; the backfill script retranslates them. */
export async function readStaleTranslationHashes(locale: string, promptVersion: string): Promise<string[]> {
  const rows = await db().sql<{ hash: string }>(
    'SELECT "hash" FROM "translationSegments" WHERE "locale" = $1 AND "prompt_version" <> $2',
    [locale, promptVersion],
  );
  return rows.map((row) => row.hash);
}

/**
 * Mark articles as needing a locale refresh. A row already pending keeps its
 * place; a completed row is reopened with a fresh request time.
 */
export async function enqueueTranslationJobs(locales: readonly string[], slugs: readonly string[]): Promise<void> {
  if (locales.length === 0 || slugs.length === 0 || getDataBackend() !== "postgres") return;
  const pairs = locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
  await db().sql(
    `INSERT INTO "translationJobs" ("locale", "slug", "requested_at", "claimed_at", "completed_at", "attempts", "last_error")
     SELECT l, s, $3::bigint, NULL, NULL, 0, NULL FROM UNNEST($1::text[], $2::text[]) AS pending(l, s)
     ON CONFLICT ("locale", "slug") DO UPDATE SET
       "requested_at" = EXCLUDED."requested_at", "completed_at" = NULL, "attempts" = 0, "last_error" = NULL`,
    [pairs.map((pair) => pair.locale), pairs.map((pair) => pair.slug), Date.now()],
  );
}

/** Lease up to `limit` due rows to this worker. Atomic: concurrent crons never take the same row. */
export async function claimTranslationJobs(limit: number): Promise<TranslationJobRow[]> {
  const now = Date.now();
  return await db().sql<TranslationJobRow>(
    `UPDATE "translationJobs" SET "claimed_at" = $1::bigint, "attempts" = "attempts" + 1
     WHERE ("locale", "slug") IN (
       SELECT "locale", "slug" FROM "translationJobs"
       WHERE "completed_at" IS NULL AND "attempts" < $3::int AND ("claimed_at" IS NULL OR "claimed_at" < $1::bigint - $4::bigint)
       ORDER BY "requested_at" ASC LIMIT $2::int FOR UPDATE SKIP LOCKED
     )
     RETURNING "locale", "slug", "attempts"`,
    [now, limit, MAX_JOB_ATTEMPTS, JOB_LEASE_MS],
  );
}

export async function completeTranslationJob(job: TranslationJobRow): Promise<void> {
  await db().sql(
    'UPDATE "translationJobs" SET "completed_at" = $3, "claimed_at" = NULL, "last_error" = NULL WHERE "locale" = $1 AND "slug" = $2',
    [job.locale, job.slug, Date.now()],
  );
}

/** Release the lease so the next run retries, keeping the error for the operator. */
export async function failTranslationJob(job: TranslationJobRow, error: string): Promise<void> {
  await db().sql(
    'UPDATE "translationJobs" SET "claimed_at" = NULL, "last_error" = $3 WHERE "locale" = $1 AND "slug" = $2',
    [job.locale, job.slug, error.slice(0, 2000)],
  );
}
