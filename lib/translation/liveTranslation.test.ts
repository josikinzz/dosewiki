import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkUnit } from "../../scripts/translation/engine.mjs";
import { resolveLocale } from "../../scripts/translation/locales.mjs";
import { PostgresClient } from "../postgres/runtime/client";

vi.mock("server-only", () => ({}));

const seam = vi.hoisted(() => ({
  client: null as unknown,
  requested: [] as string[],
  latency: ((_hashes: readonly string[]) => 0) as (hashes: readonly string[]) => number,
}));

vi.mock("@server/postgres/runtime/backend", () => ({ getPostgresClient: () => seam.client }));
vi.mock("../../scripts/translation/engine.mjs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../scripts/translation/engine.mjs")>()),
  translateBatchWithRetries: async ({ units, onUsage }: { units: readonly WorkUnit[]; onUsage?: (usage: { prompt: number; completion: number }) => void }) => {
    const hashes = units.map((unit) => unit.hash);
    seam.requested.push(...hashes);
    await new Promise((resolve) => setTimeout(resolve, seam.latency(hashes)));
    onUsage?.({ prompt: 1, completion: 1 });
    return units.map((unit) => ({ unit, target: `zh:${unit.source}`, defects: [], details: {}, attempts: 1 }));
  },
}));

import { createTranslationWave, translateUnits, type TranslationContext } from "./liveTranslation";
import { createTranslationRequestPool } from "./requestPool";

/**
 * A pool of Postgres connections with the production acquisition and lock
 * timeouts. Every segment insert takes the one global producer-state lock the
 * migration's statement trigger takes, and holds it until the transaction ends.
 */
function simulatedPostgres({ max = 4, acquireTimeoutMs = 10_000, lockTimeoutMs = 5_000, statementMs = 5, lockedWriteMs = 200 } = {}) {
  const stats = { acquisitionTimeouts: 0, lockTimeouts: 0, segmentInserts: 0 };
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  let idle = max;
  const waiters: Array<(granted: boolean) => void> = [];
  let lockOwner: object | null = null;
  const lockWaiters: Array<{ owner: object; grant: () => void }> = [];

  const releaseLock = (owner: object) => {
    if (lockOwner !== owner) return;
    const next = lockWaiters.shift();
    lockOwner = next?.owner ?? null;
    next?.grant();
  };
  const acquireLock = async (owner: object) => {
    if (lockOwner === owner) return;
    if (lockOwner === null) { lockOwner = owner; return; }
    await new Promise<void>((resolve, reject) => {
      const waiter = { owner, grant: () => { clearTimeout(timer); resolve(); } };
      const timer = setTimeout(() => {
        lockWaiters.splice(lockWaiters.indexOf(waiter), 1);
        stats.lockTimeouts += 1;
        reject(Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" }));
      }, lockTimeoutMs);
      lockWaiters.push(waiter);
    });
  };

  const connection = () => {
    const owner = {};
    return {
      async query(sql: string, params: unknown[] = []) {
        await sleep(statementMs);
        if (sql === "COMMIT" || sql === "ROLLBACK") releaseLock(owner);
        if (sql.startsWith('INSERT INTO "translationSegments"')) {
          await acquireLock(owner);
          // A write first claims new identities, then upserts every row; count the upserts.
          if (sql.includes("DO NOTHING RETURNING")) {
            const [locales, hashes] = params as [string[], string[]];
            return { rows: locales.map((locale, index) => ({ locale, hash: hashes[index] })), rowCount: locales.length };
          }
          stats.segmentInserts += 1;
          await sleep(lockedWriteMs);
        }
        return { rows: [], rowCount: 1 };
      },
      release() {
        releaseLock(owner);
        const next = waiters.shift();
        if (next) next(true);
        else idle += 1;
      },
    };
  };

  const pool = {
    on() {},
    async connect() {
      if (idle > 0) { idle -= 1; return connection(); }
      const granted = await new Promise<boolean>((resolve) => {
        const waiter = (value: boolean) => { clearTimeout(timer); resolve(value); };
        const timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          resolve(false);
        }, acquireTimeoutMs);
        waiters.push(waiter);
      });
      if (!granted) {
        stats.acquisitionTimeouts += 1;
        throw new Error("timeout exceeded when trying to connect");
      }
      return connection();
    },
  };
  return { client: new PostgresClient(pool as never), stats };
}

const context: TranslationContext = {
  locale: resolveLocale("zh-Hans"), glossary: {}, kinds: {}, glosses: {}, promptVersion: "fixture-prompt",
};

const unit = (hash: string): WorkUnit => ({
  hash, source: `Segment ${hash}.`, contextClass: "prose", group: "body", markup: false, words: 2, occurrences: 1, contextKind: "article",
});

beforeEach(() => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  vi.useFakeTimers();
  seam.requested.length = 0;
  seam.latency = () => 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function settle<T>(work: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return work;
}

describe("bulk wave segment writer", () => {
  it("completes 100 jobs that finish within a second with no pool or lock timeouts on a 4-connection pool", async () => {
    const database = simulatedPostgres();
    seam.client = database.client;
    seam.latency = (hashes) => Number(hashes[0].split("-")[1]) * 9;
    const wave = createTranslationWave();
    const requestPool = createTranslationRequestPool(100);
    const jobs = Array.from({ length: 100 }, (_, index) => translateUnits(
      [unit(`job-${index}-a`), unit(`job-${index}-b`)], context, "model-key", { requestPool, wave },
    ));
    const outcomes = await settle(Promise.allSettled(jobs));

    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toEqual([]);
    expect(database.stats).toMatchObject({ acquisitionTimeouts: 0, lockTimeouts: 0 });
    expect(database.stats.segmentInserts).toBeLessThan(100);
  });

  it("requests a segment two jobs in one wave share exactly once", async () => {
    seam.client = simulatedPostgres().client;
    seam.latency = () => 50;
    const wave = createTranslationWave();
    const requestPool = createTranslationRequestPool(100);
    const [first, second] = await settle(Promise.all([
      translateUnits([unit("shared"), unit("first-only")], context, "model-key", { requestPool, wave }),
      translateUnits([unit("shared"), unit("second-only")], context, "model-key", { requestPool, wave }),
    ]));

    expect(seam.requested.filter((hash) => hash === "shared")).toHaveLength(1);
    expect(seam.requested.sort()).toEqual(["first-only", "second-only", "shared"]);
    expect(first.stored).toBe(2);
    expect(second.stored).toBe(2);
  });

  it("fails a job whose shared segment failed in the owning job", async () => {
    seam.client = simulatedPostgres().client;
    const failing = { run: async () => { throw new Error("model unavailable"); }, limit: 1, inFlight: 0, pending: 0 };
    const wave = createTranslationWave();
    const owner = translateUnits([unit("shared")], context, "model-key", { requestPool: failing, wave });
    const waiter = translateUnits([unit("shared")], context, "model-key", { requestPool: createTranslationRequestPool(1), wave });
    const [ownerOutcome, waiterOutcome] = await settle(Promise.allSettled([owner, waiter]));
    expect(ownerOutcome).toMatchObject({ status: "rejected", reason: { message: "model unavailable" } });
    expect(waiterOutcome).toMatchObject({ status: "rejected", reason: { message: "model unavailable" } });
    expect(seam.requested).toEqual([]);
  });

  it("leaves incremental refreshes on their own write and request per job", async () => {
    const database = simulatedPostgres();
    seam.client = database.client;
    const requestPool = createTranslationRequestPool(10);
    await settle(Promise.all([
      translateUnits([unit("shared")], context, "model-key", { requestPool }),
      translateUnits([unit("shared")], context, "model-key", { requestPool }),
    ]));
    expect(seam.requested).toEqual(["shared", "shared"]);
    expect(database.stats.segmentInserts).toBe(2);
  });
});
