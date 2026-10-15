import "server-only";

import { getPostgresClient } from "@server/postgres/runtime/backend";
import { termFragments, termMatcher } from "../../scripts/translation/term-match.mjs";
import { assertDataWritesNotFrozen } from "../runtime/dataWriteFreeze";
import type { TranslationQueueCoverage } from "./translationCoverageTypes";
import { refreshLocalizedPublicationIndexes } from "./publicationIndexStore";
import { patchDocument, selectDocumentById, type SqlClient } from "../postgres/documentStore";
import { enqueuePublications, lockPublications } from "../postgres/publicationOutboxStore";
import { hasTranslationIntent, TRANSLATION_QUEUE_RECEIPT } from "../next/publicationOutbox";
import type { PublicationTarget } from "../next/publicationWire";

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

const JOB_LEASE_MS = 10 * 60 * 1000;
export const MAX_TRANSLATION_JOB_ATTEMPTS = 5;
const JOB_RETRY_BASE_MS = 150_000;
const JOB_RETRY_MAX_MS = 60 * 60 * 1000;
const WORKER_RUN_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

export async function readTranslations(locale: string, hashes: readonly string[]): Promise<Map<string, string>> {
  if (hashes.length === 0) return new Map();
  const rows = await getPostgresClient().sql<{ hash: string; target: string }>(
    'SELECT "hash", "target" FROM "translationSegments" WHERE "locale" = $1 AND "hash" = ANY($2::text[])',
    [locale, [...hashes]],
  );
  return new Map(rows.map((row) => [row.hash, row.target]));
}

export async function missingTranslationHashes(locale: string, hashes: readonly string[]): Promise<string[]> {
  const stored = await readTranslations(locale, hashes);
  return hashes.filter((hash) => !stored.has(hash));
}

export async function pendingTranslationHashes(locale: string, hashes: readonly string[], promptVersion: string): Promise<string[]> {
  if (hashes.length === 0) return [];
  const rows = await getPostgresClient().sql<{ hash: string }>(
    'SELECT "hash" FROM "translationSegments" WHERE "locale" = $1 AND "hash" = ANY($2::text[]) AND "prompt_version" = $3',
    [locale, [...hashes], promptVersion],
  );
  const current = new Set(rows.map((row) => row.hash));
  return hashes.filter((hash) => !current.has(hash));
}

export async function writeTranslations(rows: readonly TranslationSegmentRow[]): Promise<void> {
  if (rows.length === 0) return;
  assertDataWritesNotFrozen("writeTranslations");
  const now = Date.now();
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

export async function readStaleTranslationHashes(locale: string, promptVersion: string): Promise<string[]> {
  const rows = await getPostgresClient().sql<{ hash: string }>(
    'SELECT "hash" FROM "translationSegments" WHERE "locale" = $1 AND "prompt_version" <> $2',
    [locale, promptVersion],
  );
  return rows.map((row) => row.hash);
}

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

export async function readTranslationsMentioning(locale: string, terms: readonly string[]): Promise<Array<{ hash: string; source: string }>> {
  const matched = new Map<string, { hash: string; source: string }>();
  for (const term of terms) {
    const pattern = termMatcher(term);
    const like = `%${termFragments(term).map((fragment) => fragment.replace(/[\\%_]/g, (char) => `\\${char}`)).join("%")}%`;
    const rows = await getPostgresClient().sql<{ hash: string; source: string }>(
      'SELECT "hash", "source" FROM "translationSegments" WHERE "locale" = $1 AND "source" ILIKE $2',
      [locale, like],
    );
    for (const row of rows) if (pattern.test(row.source)) matched.set(row.hash, row);
  }
  return [...matched.values()];
}

const STALE_MARK = "stale";

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
  return { marked: marked.length, restamped: 0 };
}

export async function readTranslationCoverageRows(locale: string, hashes: readonly string[]): Promise<Array<{ hash: string; target: string; prompt_version: string; model: string }>> {
  if (hashes.length === 0) return [];
  return getPostgresClient().sql<{ hash: string; target: string; prompt_version: string; model: string }>(
    'SELECT "hash", "target", "prompt_version", "model" FROM "translationSegments" WHERE "locale" = $1 AND "hash" = ANY($2::text[])',
    [locale, [...hashes]],
  );
}

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
    const row = await selectDocumentById(client, "publicCachePublications", publication.id, true);
    if (!row || row.generation !== publication.generation || !row.pending) return;
    const receipts = (row.receipts ?? []) as Array<{ target?: string; generation?: number }>;
    if (hasTranslationIntent(receipts, publication.generation)) return;
    await enqueue(client);
    await patchDocument(client, "publicCachePublications", publication.id, {
      receipts: [...receipts, { target: TRANSLATION_QUEUE_RECEIPT, generation: publication.generation,
        status: "accepted", attempts: 1, jobs: pairs.map(({ locale, slug }) => `${locale}/${slug}`) }],
    });
  });
}

export async function requeueExhaustedTranslationJobs(locale: string, runId: string): Promise<string[]> {
  assertDataWritesNotFrozen("requeueExhaustedTranslationJobs");
  const rows = await getPostgresClient().sql<{ slug: string }>(
    `UPDATE "translationJobs" SET "attempts" = 0, "claimed_at" = NULL, "last_error" = NULL, "next_attempt_at" = NULL
     WHERE "locale" = $1 AND "run_id" = $2 AND "mode" = 'bulk' AND "completed_at" IS NULL AND "attempts" >= $3::int
       AND ("claimed_at" IS NULL OR "claimed_at" <= $4::bigint - $5::bigint)
     RETURNING "slug"`,
    [locale, runId, MAX_TRANSLATION_JOB_ATTEMPTS, Date.now(), JOB_LEASE_MS],
  );
  return rows.map((row) => row.slug);
}

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
  refundAttempt: boolean;
};

async function finishTranslationJob(job: TranslationJobRow, finish: JobFinish, publications: readonly PublicationTarget[] = []): Promise<boolean> {
  const entries = finish.completed ? publications.map((target) => ({ target })) : [];
  return getPostgresClient().sqlTransaction(async (client) => {
    if (entries.length > 0) await lockPublications(client, entries);
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
    if (entries.length > 0) await enqueuePublications(client, entries, { now: Date.now(), origin: "translation" });
    return true;
  });
}

export async function completeTranslationJob(
  job: TranslationJobRow,
  terminalDetail: string | null = null,
  publications: readonly PublicationTarget[] = [],
): Promise<boolean> {
  assertDataWritesNotFrozen("completeTranslationJob");
  return finishTranslationJob(job, {
    error: terminalDetail, completed: true, terminalStatus: terminalDetail ? "rejected" : null, nextAttemptAt: null, refundAttempt: false,
  }, publications);
}

export function translationJobRetryDelayMs(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(JOB_RETRY_MAX_MS, JOB_RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(base * (1 + 0.2 * random()));
}

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

export async function releaseTranslationWorkerLease(lane: string, owner: string): Promise<void> {
  assertDataWritesNotFrozen("releaseTranslationWorkerLease");
  await getPostgresClient().sql(
    'DELETE FROM "translationWorkerLeases" WHERE "mode" = $1 AND "owner" = $2',
    [lane, owner],
  );
}

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
