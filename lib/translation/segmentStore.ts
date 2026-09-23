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
import type { TranslationQueueCoverage } from "./translationCoverageTypes";
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
  mode: "incremental" | "bulk";
  run_id?: string | null;
};

export type TranslationJobMode = "incremental" | "bulk";
export type TranslationCacheJobRow = Pick<TranslationJobRow, "locale" | "slug" | "mode"> & { targets: string; attempts?: number };

/** A stale lease is retaken after this long; the cron's own budget is shorter. */
const JOB_LEASE_MS = 10 * 60 * 1000;
export const MAX_TRANSLATION_JOB_ATTEMPTS = 5;
/** First retry delay; each later failure doubles it, so five failures span over half an hour. */
const JOB_RETRY_BASE_MS = 150_000;
const JOB_RETRY_MAX_MS = 60 * 60 * 1000;
/** Cache delivery claims before a cache job is left as a dead letter; the backoff spreads them over about two hours. */
export const MAX_TRANSLATION_CACHE_JOB_ATTEMPTS = 8;
const CACHE_RETRY_BASE_MS = 60_000;
/** Run rows older than this are pruned when the same lane records a new run. */
const WORKER_RUN_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

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

/** Record each actual text replacement atomically with its previous rendering. */
export async function writeTranslations(rows: readonly TranslationSegmentRow[]): Promise<void> {
  if (rows.length === 0) return;
  assertDataWritesNotFrozen("writeTranslations");
  const now = Date.now();
  // Canonical lock order and one final value per identity avoid intra-batch conflicts.
  const unique = [...new Map(rows.map((row) => [JSON.stringify([row.locale, row.hash]), row])).values()]
    .sort((a, b) => a.locale.localeCompare(b.locale) || a.hash.localeCompare(b.hash));
  const values = [unique.map((r) => r.locale), unique.map((r) => r.hash), unique.map((r) => r.source), unique.map((r) => r.target), unique.map((r) => r.model), unique.map((r) => r.prompt_version), unique.map(() => now)];
  const insert = `INSERT INTO "translationSegments" ("locale", "hash", "source", "target", "model", "prompt_version", "created_at")
     SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::bigint[])`;
  await getPostgresClient().sqlTransaction(async (client) => {
    const inserted = await client.query(`${insert} ON CONFLICT ("locale", "hash") DO NOTHING RETURNING "locale", "hash"`, values);
    const created = new Set(inserted.rows.map((row) => JSON.stringify([row.locale, row.hash])));
    const previous = await client.query(`SELECT s.* FROM "translationSegments" s
      JOIN UNNEST($1::text[], $2::text[]) AS wanted(locale, hash) ON s."locale"=wanted.locale AND s."hash"=wanted.hash
      ORDER BY s."locale", s."hash" FOR UPDATE OF s`, values.slice(0, 2));
    const oldRows = new Map(previous.rows.map((row) => [JSON.stringify([row.locale, row.hash]), row]));
    const snapshot = (row: { source: unknown; target: unknown; model: unknown; prompt_version: unknown }) => ({ source: row.source, target: row.target, model: row.model, promptVersion: row.prompt_version });
    const changes = unique.flatMap((row) => {
      const key = JSON.stringify([row.locale, row.hash]);
      const old = oldRows.get(key);
      if (!created.has(key) && old?.target === row.target && old?.source === row.source) return [];
      return [{ locale: row.locale, hash: row.hash, before: created.has(key) || !old ? null : snapshot(old), after: snapshot(row) }];
    });
    if (changes.length) await client.query(`INSERT INTO "translationSegmentHistory" ("locale","hash","before_state","after_state","created_at")
      SELECT x.locale,x.hash,x.before,x.after,$2 FROM jsonb_to_recordset($1::jsonb) AS x(locale text,hash text,before jsonb,after jsonb)`, [JSON.stringify(changes), now]);
    await client.query(`${insert} ON CONFLICT ("locale", "hash") DO UPDATE SET
      "source"=EXCLUDED."source", "target"=EXCLUDED."target", "model"=EXCLUDED."model",
      "prompt_version"=EXCLUDED."prompt_version", "created_at"=EXCLUDED."created_at"`, values);
    await refreshLocalizedPublicationIndexes(client, { segments: unique });
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

export type TranslationJobCounts = {
  inFlight?: number;
  retrying?: number;
  runId: string | null;
  requestedAt: number | null;
  total: number;
  active: number;
  completed: number;
  completedWithRejections: number;
  exhausted: number;
};

/** The newest enqueue generation only, so old completed editorial jobs do not distort bulk-run progress. */
export async function translationJobCounts(locale: string): Promise<TranslationJobCounts> {
  const [row] = await getPostgresClient().sql<{
    run_id: string | null;
    requested_at: string | null;
    total: string;
    active: string;
    completed: string;
    completed_with_rejections: string;
    exhausted: string;
    in_flight: string;
    retrying: string;
  }>(
    `WITH latest AS (
       SELECT "run_id", MAX("requested_at") AS requested_at
         FROM "translationJobs"
        WHERE "locale" = $1 AND "mode" = 'bulk' AND "run_id" IS NOT NULL
        GROUP BY "run_id" ORDER BY MAX("requested_at") DESC LIMIT 1
     )
     SELECT latest.run_id, latest.requested_at::text,
            COUNT(j.*) FILTER (WHERE j."completed_at" IS NULL AND j."claimed_at" > (EXTRACT(EPOCH FROM NOW()) * 1000 - $3))::text AS in_flight,
            COUNT(j.*) FILTER (WHERE j."completed_at" IS NULL AND j."attempts" < $2 AND j."last_error" IS NOT NULL)::text AS retrying,
            COUNT(j.*)::text AS total,
            COUNT(j.*) FILTER (WHERE j."completed_at" IS NULL AND (j."attempts" < $2 OR j."claimed_at" > (EXTRACT(EPOCH FROM NOW()) * 1000 - $3)))::text AS active,
            COUNT(j.*) FILTER (WHERE j."completed_at" IS NOT NULL)::text AS completed,
            COUNT(j.*) FILTER (WHERE j."completed_at" IS NOT NULL AND j."terminal_status" = 'rejected')::text AS completed_with_rejections,
            COUNT(j.*) FILTER (WHERE j."completed_at" IS NULL AND j."attempts" >= $2 AND (j."claimed_at" IS NULL OR j."claimed_at" <= (EXTRACT(EPOCH FROM NOW()) * 1000 - $3)))::text AS exhausted
       FROM latest LEFT JOIN "translationJobs" j
         ON j."locale" = $1 AND j."run_id" = latest.run_id
      GROUP BY latest.run_id, latest.requested_at`,
    [locale, MAX_TRANSLATION_JOB_ATTEMPTS, JOB_LEASE_MS],
  );
  return {
    inFlight: Number(row?.in_flight ?? 0),
    retrying: Number(row?.retrying ?? 0),
    runId: row?.run_id ?? null,
    requestedAt: row?.requested_at === null || row?.requested_at === undefined ? null : Number(row.requested_at),
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    completed: Number(row?.completed ?? 0),
    completedWithRejections: Number(row?.completed_with_rejections ?? 0),
    exhausted: Number(row?.exhausted ?? 0),
  };
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

/** Mark only the selected hashes stale. Unrelated old digests are not proven current. */
export async function scopeStaleTranslations(
  locale: string,
  hashes: readonly string[],
  _promptVersion: string,
): Promise<{ marked: number; restamped: number }> {
  assertDataWritesNotFrozen("scopeStaleTranslations");
  const marked = await getPostgresClient().sql<{ hash: string }>(
    'UPDATE "translationSegments" SET "prompt_version" = $3 WHERE "locale" = $1 AND "hash" = ANY($2::text[]) RETURNING "hash"',
    [locale, [...hashes], STALE_MARK],
  );
  // A different digest may reflect other unpropagated terms or a prompt change.
  // Restamping it would hide that work without producing a new translation.
  return { marked: marked.length, restamped: 0 };
}

/** Read-only coverage metadata for a bounded source-derived set of hashes. */
export async function readTranslationCoverageRows(locale: string, hashes: readonly string[]): Promise<Array<{ hash: string; target: string; prompt_version: string; model: string }>> {
  if (hashes.length === 0) return [];
  return getPostgresClient().sql<{ hash: string; target: string; prompt_version: string; model: string }>(
    'SELECT "hash", "target", "prompt_version", "model" FROM "translationSegments" WHERE "locale" = $1 AND "hash" = ANY($2::text[])',
    [locale, [...hashes]],
  );
}

/** A queue snapshot is separate from source coverage and publication evidence. */
export async function translationQueueCoverage(locale: string): Promise<TranslationQueueCoverage> {
  const [row] = await getPostgresClient().sql<Record<keyof TranslationQueueCoverage, string>>(
    `WITH jobs AS (
       SELECT *, ("claimed_at" IS NOT NULL AND "claimed_at" >= $2::bigint - $3::bigint) AS running
       FROM "translationJobs" WHERE "locale" = $1
     ) SELECT
       COUNT(*) FILTER (WHERE "completed_at" IS NULL AND NOT running AND "attempts" < $4::int)::text AS queued,
       COUNT(*) FILTER (WHERE "completed_at" IS NULL AND running)::text AS running,
       COUNT(*) FILTER (WHERE "completed_at" IS NULL AND NOT running AND "attempts" >= $4::int)::text AS failed,
       COUNT(*) FILTER (WHERE "completed_at" IS NOT NULL)::text AS completed,
       COUNT(*) FILTER (WHERE "completed_at" IS NULL AND NOT running AND "attempts" < $4::int AND "last_error" IS NOT NULL)::text AS retrying
     FROM jobs`,
    [locale, Date.now(), JOB_LEASE_MS, MAX_TRANSLATION_JOB_ATTEMPTS],
  );
  return {
    queued: Number(row?.queued ?? 0), running: Number(row?.running ?? 0), failed: Number(row?.failed ?? 0),
    completed: Number(row?.completed ?? 0), retrying: Number(row?.retrying ?? 0),
  };
}

/**
 * Mark records as needing a locale refresh. The request timestamp is also a
 * strictly increasing generation, even for repeated requests in one millisecond.
 */
export async function enqueueTranslationJobs(
  locales: readonly string[],
  slugs: readonly string[],
  options: {
    publication?: { id: string; generation: number };
    run?: { id: string; mode: TranslationJobMode };
  } = {},
): Promise<void> {
  if (locales.length === 0 || slugs.length === 0) return;
  assertDataWritesNotFrozen("enqueueTranslationJobs");
  const pairs = [...new Set(locales)].flatMap((locale) => [...new Set(slugs)].map((slug) => ({ locale, slug })));
  const enqueue = async (client: SqlClient) => {
    await client.query(
      `INSERT INTO "translationJobs" ("locale", "slug", "requested_at", "claimed_at", "completed_at", "attempts", "last_error", "mode", "run_id", "terminal_status")
       SELECT l, s, $3::bigint, NULL, NULL, 0, NULL, $4, $5, NULL FROM UNNEST($1::text[], $2::text[]) AS pending(l, s)
       ON CONFLICT ("locale", "slug", "mode") DO UPDATE SET
         "requested_at" = GREATEST(EXCLUDED."requested_at", "translationJobs"."requested_at" + 1),
         "claimed_at" = NULL, "completed_at" = NULL, "attempts" = 0, "last_error" = NULL,
         "run_id" = EXCLUDED."run_id", "terminal_status" = NULL, "next_attempt_at" = NULL`,
      [pairs.map((pair) => pair.locale), pairs.map((pair) => pair.slug), Date.now(), options.run?.mode ?? "incremental", options.run?.id ?? null],
    );
  };
  await getPostgresClient().sqlTransaction(async (client) => {
    if (!options.publication) return enqueue(client);
    const publication = options.publication;
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

/**
 * Lease up to `limit` due rows to this worker, optionally from one locale.
 * Atomic: concurrent crons never take the same row. A row waiting out a
 * failure backoff is not due.
 */
export async function claimTranslationJobs(limit: number, mode: TranslationJobMode = "incremental", locale?: string): Promise<TranslationJobRow[]> {
  assertDataWritesNotFrozen("claimTranslationJobs");
  const now = Date.now();
  return await getPostgresClient().sql<TranslationJobRow>(
    `UPDATE "translationJobs" SET "claimed_at" = $1::bigint, "attempts" = "attempts" + 1
     WHERE ("locale", "slug", "mode") IN (
       SELECT "locale", "slug", "mode" FROM "translationJobs"
       WHERE "mode" = $5 AND ($6::text IS NULL OR "locale" = $6::text) AND "completed_at" IS NULL AND "attempts" < $3::int AND ("claimed_at" IS NULL OR "claimed_at" < $1::bigint - $4::bigint)
         AND ("next_attempt_at" IS NULL OR "next_attempt_at" <= $1::bigint)
       ORDER BY "requested_at" ASC LIMIT $2::int FOR UPDATE SKIP LOCKED
     )
     RETURNING "locale", "slug", "attempts", "requested_at"::text, "claimed_at"::text, "mode", "run_id"`,
    [now, limit, MAX_TRANSLATION_JOB_ATTEMPTS, JOB_LEASE_MS, mode, locale ?? null],
  );
}

type JobFinish = {
  error: string | null;
  completed: boolean;
  terminalStatus: "rejected" | null;
  nextAttemptAt: number | null;
  /** Give back the attempt the claim spent. */
  refundAttempt: boolean;
};

async function finishTranslationJob(job: TranslationJobRow, finish: JobFinish, cacheTargets: unknown[] = []): Promise<boolean> {
  return getPostgresClient().sqlTransaction(async (client) => {
    const current = await client.query<TranslationJobRow & { completed_at: string | null }>(
      `SELECT "locale", "slug", "requested_at"::text, "claimed_at"::text, "attempts", "completed_at"::text
       FROM "translationJobs" WHERE "locale" = $1 AND "slug" = $2 AND "mode" = $3 FOR UPDATE`,
      [job.locale, job.slug, job.mode],
    );
    const row = current.rows[0];
    if (!row || row.completed_at !== null || row.requested_at !== job.requested_at ||
        row.claimed_at !== job.claimed_at || row.attempts !== job.attempts) return false;
    await client.query(
      `UPDATE "translationJobs" SET "completed_at" = $3::bigint, "claimed_at" = NULL, "last_error" = $4, "terminal_status" = $5,
         "next_attempt_at" = $7::bigint, "attempts" = "attempts" - $8::int
       WHERE "locale" = $1 AND "slug" = $2 AND "mode" = $6`,
      [job.locale, job.slug, finish.completed ? Date.now() : null, finish.error, finish.terminalStatus, job.mode,
        finish.nextAttemptAt, finish.refundAttempt ? 1 : 0],
    );
    if (finish.completed && cacheTargets.length > 0) {
      await client.query(
        `INSERT INTO "translationCacheJobs" ("locale", "slug", "mode", "targets", "requested_at")
         VALUES ($1, $2, $3, $4, $5::bigint)
         ON CONFLICT ("locale", "slug", "mode") DO UPDATE SET "targets" = EXCLUDED."targets", "requested_at" = EXCLUDED."requested_at",
           "attempts" = 0, "next_attempt_at" = NULL, "last_error" = NULL`,
        [job.locale, job.slug, job.mode, JSON.stringify(cacheTargets), Date.now()],
      );
    }
    return true;
  });
}

export async function completeTranslationJob(job: TranslationJobRow, terminalDetail: string | null = null, cacheTargets: unknown[] = []): Promise<boolean> {
  assertDataWritesNotFrozen("completeTranslationJob");
  return finishTranslationJob(job, {
    error: terminalDetail, completed: true, terminalStatus: terminalDetail ? "rejected" : null, nextAttemptAt: null, refundAttempt: false,
  }, cacheTargets);
}

/**
 * Exponential backoff with upward jitter after the `attempts`-th failure:
 * 150 s, 300 s, 600 s, 1200 s, capped at one hour, each stretched by up to 20%.
 */
export function translationJobRetryDelayMs(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(JOB_RETRY_MAX_MS, JOB_RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(base * (1 + 0.2 * random()));
}

/**
 * Release only this lease. A failure waits out its backoff before the next
 * claim; the five-attempt cap leaves exhausted errors inspectable. A run
 * budget abort after the record stored segments (`progressed`) gives back its
 * attempt and stays due, so a large record that keeps making progress never
 * exhausts.
 */
export async function failTranslationJob(job: TranslationJobRow, error: string, options: { progressed?: boolean } = {}): Promise<boolean> {
  assertDataWritesNotFrozen("failTranslationJob");
  const progressed = options.progressed === true;
  return finishTranslationJob(job, {
    error: error.slice(0, 2000),
    completed: false,
    terminalStatus: null,
    nextAttemptAt: progressed ? null : Date.now() + translationJobRetryDelayMs(job.attempts),
    refundAttempt: progressed,
  });
}

/** Acquire one cross-process lease for a worker lane. */
export async function acquireTranslationWorkerLease(lane: string, owner: string, leaseMs: number): Promise<boolean> {
  assertDataWritesNotFrozen("acquireTranslationWorkerLease");
  const now = Date.now();
  const rows = await getPostgresClient().sql<{ owner: string }>(
    `INSERT INTO "translationWorkerLeases" ("mode", "owner", "expires_at") VALUES ($1, $2, $3::bigint)
     ON CONFLICT ("mode") DO UPDATE SET "owner" = EXCLUDED."owner", "expires_at" = EXCLUDED."expires_at"
       WHERE "translationWorkerLeases"."expires_at" < $4::bigint
     RETURNING "owner"`,
    [lane, owner, now + leaseMs, now],
  );
  return rows[0]?.owner === owner;
}

/** Release only the lease owned by this invocation. */
export async function releaseTranslationWorkerLease(lane: string, owner: string): Promise<void> {
  assertDataWritesNotFrozen("releaseTranslationWorkerLease");
  await getPostgresClient().sql(
    'DELETE FROM "translationWorkerLeases" WHERE "mode" = $1 AND "owner" = $2',
    [lane, owner],
  );
}

/**
 * Lease up to `limit` due cache jobs: fresh rows first, then retries, oldest
 * first within each. A claim spends an attempt and leases the row until its
 * backoff, so a crash or a failed delivery leaves it due later. Rows at the
 * attempt cap are dead letters: never claimed, kept with their last error.
 */
export async function claimTranslationCacheJobs(limit = 100): Promise<TranslationCacheJobRow[]> {
  assertDataWritesNotFrozen("claimTranslationCacheJobs");
  const now = Date.now();
  return getPostgresClient().sql<TranslationCacheJobRow>(
    `UPDATE "translationCacheJobs" SET "attempts" = "attempts" + 1,
       "next_attempt_at" = $1::bigint + LEAST($4::bigint, $5::bigint * POWER(2, "attempts")::bigint)
     WHERE ("locale", "slug", "mode") IN (
       SELECT "locale", "slug", "mode" FROM "translationCacheJobs"
       WHERE "attempts" < $3::int AND ("next_attempt_at" IS NULL OR "next_attempt_at" <= $1::bigint)
       ORDER BY ("attempts" > 0), "requested_at" ASC LIMIT $2::int FOR UPDATE SKIP LOCKED
     )
     RETURNING "locale", "slug", "mode", "targets", "attempts"`,
    [now, limit, MAX_TRANSLATION_CACHE_JOB_ATTEMPTS, JOB_RETRY_MAX_MS, CACHE_RETRY_BASE_MS],
  );
}

/** Keep the reason a delivery failed; the claim already scheduled the retry. */
export async function failTranslationCacheJob(job: TranslationCacheJobRow, error: string): Promise<void> {
  assertDataWritesNotFrozen("failTranslationCacheJob");
  await getPostgresClient().sql(
    'UPDATE "translationCacheJobs" SET "last_error" = $4 WHERE "locale" = $1 AND "slug" = $2 AND "mode" = $3',
    [job.locale, job.slug, job.mode, error.slice(0, 2000)],
  );
}

export async function completeTranslationCacheJob(job: TranslationCacheJobRow): Promise<void> {
  assertDataWritesNotFrozen("completeTranslationCacheJob");
  await getPostgresClient().sql(
    'DELETE FROM "translationCacheJobs" WHERE "locale" = $1 AND "slug" = $2 AND "mode" = $3',
    [job.locale, job.slug, job.mode],
  );
}

/** One worker invocation's summary, as `runTranslationJobs` returns it. */
export type TranslationWorkerRunRecord = {
  id: string;
  mode: TranslationJobMode;
  leaseHeld: boolean;
  startedAt: number;
  durationMs: number;
  claimed: number;
  completed: number;
  failed: number;
  exhausted: number;
  cachePending: number;
  usage: { prompt: number; completion: number; requests: number };
  firstError: string | null;
};

/** Store one run row and prune this lane's rows past the retention window. */
export async function recordTranslationWorkerRun(run: TranslationWorkerRunRecord): Promise<void> {
  assertDataWritesNotFrozen("recordTranslationWorkerRun");
  await getPostgresClient().sqlTransaction(async (client) => {
    await client.query(
      `INSERT INTO "translationWorkerRuns" ("id", "mode", "lease_held", "started_at", "duration_ms", "claimed", "completed",
         "failed", "exhausted", "cache_pending", "prompt_tokens", "completion_tokens", "requests", "first_error")
       VALUES ($1, $2, $3, $4::bigint, $5::int, $6::int, $7::int, $8::int, $9::int, $10::int, $11::bigint, $12::bigint, $13::int, $14)`,
      [
        run.id, run.mode, run.leaseHeld, run.startedAt, Math.round(run.durationMs), run.claimed, run.completed,
        run.failed, run.exhausted, run.cachePending, run.usage.prompt, run.usage.completion, run.usage.requests,
        run.firstError?.slice(0, 2000) ?? null,
      ],
    );
    await client.query(
      'DELETE FROM "translationWorkerRuns" WHERE "mode" = $1 AND "started_at" < $2::bigint',
      [run.mode, run.startedAt - WORKER_RUN_RETENTION_MS],
    );
  });
}

type TranslationWorkerRunRow = {
  id: string; mode: TranslationJobMode; lease_held: boolean; started_at: string; duration_ms: number;
  claimed: number; completed: number; failed: number; exhausted: number; cache_pending: number;
  prompt_tokens: string; completion_tokens: string; requests: number; first_error: string | null;
};

/** The newest run row of each lane, for operators asking whether a lane is moving. */
export async function readLatestTranslationWorkerRuns(): Promise<TranslationWorkerRunRecord[]> {
  const rows = await getPostgresClient().sql<TranslationWorkerRunRow>(
    `SELECT DISTINCT ON ("mode") "id", "mode", "lease_held", "started_at"::text, "duration_ms", "claimed", "completed",
       "failed", "exhausted", "cache_pending", "prompt_tokens"::text, "completion_tokens"::text, "requests", "first_error"
     FROM "translationWorkerRuns" ORDER BY "mode", "started_at" DESC, "id"`,
  );
  return rows.map((row) => ({
    id: row.id,
    mode: row.mode,
    leaseHeld: row.lease_held,
    startedAt: Number(row.started_at),
    durationMs: row.duration_ms,
    claimed: row.claimed,
    completed: row.completed,
    failed: row.failed,
    exhausted: row.exhausted,
    cachePending: row.cache_pending,
    usage: { prompt: Number(row.prompt_tokens), completion: Number(row.completion_tokens), requests: row.requests },
    firstError: row.first_error,
  }));
}
