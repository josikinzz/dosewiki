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
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
