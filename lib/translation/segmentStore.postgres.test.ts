/**
 * The translation queue SQL run against a real Postgres engine. Each run
 * creates a scratch database, applies every versioned migration in journal
 * order, and drops the database afterwards. Set
 * TRANSLATION_QUEUE_TEST_POSTGRES_URL to a loopback server
 * (`bun run postgres:local url` names one); any other host is refused.
 */
import fs from "node:fs";
import path from "node:path";

import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const serverUrl = process.env.TRANSLATION_QUEUE_TEST_POSTGRES_URL;
const scratch = vi.hoisted(() => ({ pool: null as import("pg").Pool | null }));

vi.mock("@server/postgres/runtime/backend", () => ({
  getPostgresClient: () => {
    const pool = scratch.pool;
    if (!pool) throw new Error("scratch database is not ready");
    const transaction = async <T>(operation: (client: PoolClient) => Promise<T>): Promise<T> => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await operation(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    };
    return {
      sql: async (text: string, values: unknown[] = []) => transaction(async (client) => (await client.query(text, values)).rows),
      sqlTransaction: transaction,
    };
  },
}));

import {
  MAX_TRANSLATION_CACHE_JOB_ATTEMPTS,
  MAX_TRANSLATION_JOB_ATTEMPTS,
  claimTranslationCacheJobs,
  claimTranslationJobs,
  completeTranslationJob,
  enqueueTranslationJobs,
  failTranslationCacheJob,
  failTranslationJob,
  readLatestTranslationWorkerRuns,
  recordTranslationWorkerRun,
  type TranslationWorkerRunRecord,
} from "./segmentStore";

const MIGRATIONS = path.resolve(__dirname, "../postgres/migrations");

function loopbackOnly(url: string): URL {
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
    throw new Error(`TRANSLATION_QUEUE_TEST_POSTGRES_URL must name a loopback server, not ${parsed.hostname}`);
  }
  return parsed;
}

async function applyMigrations(pool: Pool): Promise<void> {
  const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS, "meta", "_journal.json"), "utf8")) as { entries: Array<{ tag: string }> };
  for (const { tag } of journal.entries) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, `${tag}.sql`), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await pool.query(statement);
    }
  }
}

describe.runIf(serverUrl)("translation queue SQL on a scratch Postgres", () => {
  const database = `translation_queue_test_${process.pid}_${Date.now()}`;
  let admin: Pool;

  beforeAll(async () => {
    const server = loopbackOnly(serverUrl!);
    admin = new Pool({ connectionString: server.toString(), max: 1 });
    await admin.query(`CREATE DATABASE "${database}"`);
    const target = new URL(server.toString());
    target.pathname = `/${database}`;
    scratch.pool = new Pool({ connectionString: target.toString(), max: 4 });
    await applyMigrations(scratch.pool);
  }, 60_000);

  afterAll(async () => {
    await scratch.pool?.end();
    scratch.pool = null;
    await admin?.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin?.end();
  });

  beforeEach(() => {
    vi.stubEnv("DATA_WRITES_FROZEN", "0");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("translation job backoff", () => {
    const at = (ms: number) => vi.setSystemTime(ms);
    const jobRow = async (slug: string) => (await scratch.pool!.query<{ attempts: number; next_attempt_at: string | null }>(
      'SELECT "attempts", "next_attempt_at"::text FROM "translationJobs" WHERE "slug" = $1', [slug],
    )).rows[0];

    beforeEach(async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      await scratch.pool!.query('DELETE FROM "translationJobs"');
    });

    it("keeps a failed job out of an immediate claim and returns it after its delay", async () => {
      const start = Date.UTC(2026, 8, 22, 12);
      at(start);
      await enqueueTranslationJobs(["es"], ["lsd"]);
      const [job] = await claimTranslationJobs(10);
      expect(job).toMatchObject({ slug: "lsd", attempts: 1 });
      expect(await failTranslationJob(job, "provider unavailable")).toBe(true);

      expect(await claimTranslationJobs(10)).toEqual([]);
      const due = Number((await jobRow("lsd")).next_attempt_at);
      expect(due).toBeGreaterThan(start);
      at(due - 1);
      expect(await claimTranslationJobs(10)).toEqual([]);
      at(due);
      expect(await claimTranslationJobs(10)).toEqual([expect.objectContaining({ slug: "lsd", attempts: 2 })]);
    });

    it("spreads five consecutive failures over at least 30 minutes, then stops claiming", async () => {
      const start = Date.UTC(2026, 8, 22, 12);
      at(start);
      await enqueueTranslationJobs(["es"], ["mdma"]);
      const failures: number[] = [];
      for (let attempt = 1; attempt <= MAX_TRANSLATION_JOB_ATTEMPTS; attempt += 1) {
        const [job] = await claimTranslationJobs(10);
        expect(job).toMatchObject({ slug: "mdma", attempts: attempt });
        failures.push(Date.now());
        await failTranslationJob(job, `failure ${attempt}`);
        const next = (await jobRow("mdma")).next_attempt_at;
        if (next !== null) at(Number(next));
      }
      expect(failures[failures.length - 1] - failures[0]).toBeGreaterThanOrEqual(30 * 60 * 1000);
      at(Date.now() + 24 * 60 * 60 * 1000);
      expect(await claimTranslationJobs(10)).toEqual([]);
    });

    it("keeps the attempt of a budget abort that stored progress and leaves it due at once", async () => {
      at(Date.UTC(2026, 8, 22, 12));
      await enqueueTranslationJobs(["es"], ["dmt"]);
      const [job] = await claimTranslationJobs(10);
      expect(await failTranslationJob(job, "run budget reached", { progressed: true })).toBe(true);
      expect(await jobRow("dmt")).toMatchObject({ attempts: 0, next_attempt_at: null });
      expect(await claimTranslationJobs(10)).toEqual([expect.objectContaining({ slug: "dmt", attempts: 1 })]);
    });

    it("clears a pending delay when the record is enqueued again", async () => {
      at(Date.UTC(2026, 8, 22, 12));
      await enqueueTranslationJobs(["es"], ["ketamine"]);
      const [job] = await claimTranslationJobs(10);
      await failTranslationJob(job, "provider unavailable");
      await enqueueTranslationJobs(["es"], ["ketamine"]);
      expect(await jobRow("ketamine")).toMatchObject({ attempts: 0, next_attempt_at: null });
      expect(await claimTranslationJobs(10)).toHaveLength(1);
    });
  });

  describe("translation cache job dead letters", () => {
    const insertCacheJob = (slug: string, overrides: { attempts?: number; requestedAt?: number; targets?: string } = {}) =>
      scratch.pool!.query(
        `INSERT INTO "translationCacheJobs" ("locale", "slug", "mode", "targets", "requested_at", "attempts")
         VALUES ('es', $1, 'incremental', $2, $3::bigint, $4::int)`,
        [slug, overrides.targets ?? "[]", overrides.requestedAt ?? Date.now(), overrides.attempts ?? 0],
      );
    const cacheRow = async (slug: string) => (await scratch.pool!.query<{ attempts: number; next_attempt_at: string | null; last_error: string | null }>(
      'SELECT "attempts", "next_attempt_at"::text, "last_error" FROM "translationCacheJobs" WHERE "slug" = $1', [slug],
    )).rows[0];

    beforeEach(async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.UTC(2026, 8, 22, 12));
      await scratch.pool!.query('DELETE FROM "translationCacheJobs"');
    });

    it("claims fresh cache jobs ahead of older retries", async () => {
      const now = Date.now();
      for (let index = 0; index < 3; index += 1) await insertCacheJob(`retry-${index}`, { attempts: 2, requestedAt: now - 60_000 });
      await insertCacheJob("fresh", { requestedAt: now });
      expect((await claimTranslationCacheJobs(1)).map((job) => job.slug)).toEqual(["fresh"]);
    });

    it("leases a claimed job until its backoff and never hands it to a concurrent claim", async () => {
      await insertCacheJob("lsd");
      expect(await claimTranslationCacheJobs(10)).toHaveLength(1);
      expect(await claimTranslationCacheJobs(10)).toEqual([]);
      vi.setSystemTime(Number((await cacheRow("lsd")).next_attempt_at));
      expect(await claimTranslationCacheJobs(10)).toEqual([expect.objectContaining({ slug: "lsd", attempts: 2 })]);
    });

    it("stops claiming a job with unparseable targets once it reaches the cap, keeping its error", async () => {
      await insertCacheJob("broken", { targets: "not json" });
      let claims = 0;
      for (;;) {
        const [job] = await claimTranslationCacheJobs(10);
        if (!job) break;
        claims += 1;
        await failTranslationCacheJob(job, "Unexpected token 'o', \"not json\" is not valid JSON");
        const next = (await cacheRow("broken")).next_attempt_at;
        vi.setSystemTime(Number(next));
        expect(claims).toBeLessThanOrEqual(MAX_TRANSLATION_CACHE_JOB_ATTEMPTS);
      }
      expect(claims).toBe(MAX_TRANSLATION_CACHE_JOB_ATTEMPTS);
      vi.setSystemTime(Date.now() + 7 * 24 * 60 * 60 * 1000);
      expect(await claimTranslationCacheJobs(10)).toEqual([]);
      expect(await cacheRow("broken")).toMatchObject({
        attempts: MAX_TRANSLATION_CACHE_JOB_ATTEMPTS, last_error: expect.stringContaining("not valid JSON"),
      });
    });

    it("resets a dead cache job when its translation completes again", async () => {
      await insertCacheJob("fixture", { attempts: MAX_TRANSLATION_CACHE_JOB_ATTEMPTS });
      await scratch.pool!.query('DELETE FROM "translationJobs"');
      await enqueueTranslationJobs(["es"], ["fixture"]);
      const [job] = await claimTranslationJobs(10);
      expect(await completeTranslationJob(job, null, [{ kind: "article-translation", slug: "fixture", locale: "es" }])).toBe(true);
      expect(await cacheRow("fixture")).toMatchObject({ attempts: 0, next_attempt_at: null, last_error: null });
    });
  });

  describe("worker run log", () => {
    const run = (overrides: Partial<TranslationWorkerRunRecord>): TranslationWorkerRunRecord => ({
      id: crypto.randomUUID(), mode: "bulk", leaseHeld: true, startedAt: Date.now(), durationMs: 1200,
      claimed: 3, completed: 2, failed: 1, exhausted: 0, cachePending: 0,
      usage: { prompt: 100, completion: 200, requests: 4 }, firstError: null, ...overrides,
    });

    it("returns the latest run per mode with the stored counts", async () => {
      const now = Date.now();
      await recordTranslationWorkerRun(run({ startedAt: now - 3_000, claimed: 9 }));
      const latestBulk = run({ startedAt: now - 1_000, failed: 2, firstError: "Insufficient credits" });
      await recordTranslationWorkerRun(latestBulk);
      await recordTranslationWorkerRun(run({ mode: "incremental", startedAt: now - 5_000 }));
      const denied = run({ mode: "incremental", startedAt: now - 2_000, leaseHeld: false, claimed: 0, completed: 0, failed: 0 });
      await recordTranslationWorkerRun(denied);

      const latest = await readLatestTranslationWorkerRuns();
      expect(latest).toEqual([latestBulk, denied]);
    });

    it("prunes a lane's rows past the retention window when that lane records a run", async () => {
      const now = Date.now();
      const stale = run({ mode: "bulk", startedAt: now - 15 * 24 * 60 * 60 * 1000 });
      await scratch.pool!.query('DELETE FROM "translationWorkerRuns"');
      await recordTranslationWorkerRun(stale);
      await recordTranslationWorkerRun(run({ mode: "bulk", startedAt: now }));
      const { rows } = await scratch.pool!.query<{ id: string }>('SELECT "id" FROM "translationWorkerRuns"');
      expect(rows.map((row) => row.id)).not.toContain(stale.id);
      expect(rows).toHaveLength(1);
    });
  });
});
