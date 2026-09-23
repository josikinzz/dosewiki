import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seams = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), sql: vi.fn(), select: vi.fn(), patch: vi.fn(), selectMany: vi.fn(), insert: vi.fn() }));
vi.mock("@server/postgres/runtime/backend", () => ({
  getPostgresClient: () => ({ sqlTransaction: seams.transaction, sql: seams.sql }),
}));
vi.mock("../postgres/documentStore", () => ({
  selectDocumentById: seams.select, patchDocument: seams.patch, selectDocuments: seams.selectMany, insertDocument: seams.insert,
}));

import {
  MAX_TRANSLATION_JOB_ATTEMPTS,
  acquireTranslationWorkerLease,
  completeTranslationJob,
  enqueueTranslationJobs,
  failTranslationJob,
  releaseTranslationWorkerLease,
  translationJobRetryDelayMs,
  type TranslationJobRow,
} from "./segmentStore";

const lease: TranslationJobRow = {
  locale: "zh-Hans", slug: "fixture", requested_at: "1000", claimed_at: "1001", attempts: 1, mode: "incremental",
};

beforeEach(() => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  seams.transaction.mockImplementation(async (operation) => operation({ query: seams.query }));
});

describe("worker lane lease", () => {
  it("admits only the owner returned by the database and releases by owner", async () => {
    seams.sql.mockResolvedValueOnce([{ owner: "worker-a" }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect(await acquireTranslationWorkerLease("bulk", "worker-a", 230_000)).toBe(true);
    expect(await acquireTranslationWorkerLease("bulk", "worker-b", 230_000)).toBe(false);
    await releaseTranslationWorkerLease("bulk", "worker-a");
    expect(String(seams.sql.mock.calls[2]?.[0])).toContain('DELETE FROM "translationWorkerLeases"');
  });
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
describe("translation lease ownership", () => {
  it("refuses an older generation's completion without erasing newer work", async () => {
    const current = { ...lease, requested_at: "1001", claimed_at: null, attempts: 0, completed_at: null };
    seams.query.mockResolvedValue({ rows: [current] });
    expect(await completeTranslationJob(lease)).toBe(false);
    expect(current).toMatchObject({ requested_at: "1001", completed_at: null, attempts: 0 });
    expect(seams.query).toHaveBeenCalledTimes(1);
  });

  it("refuses a failure from an expired lease after another worker reclaimed it", async () => {
    seams.query.mockResolvedValue({ rows: [{ ...lease, claimed_at: "601002", attempts: 2, completed_at: null }] });
    expect(await failTranslationJob(lease, "old worker failed")).toBe(false);
    expect(seams.query).toHaveBeenCalledTimes(1);
  });

  it("accepts the current lease exactly once", async () => {
    const current = { ...lease, completed_at: null as number | null };
    seams.query.mockImplementation(async (_sql, values) => {
      if (values.length === 3) return { rows: [{ ...current }] };
      current.completed_at = values[2];
      return { rows: [] };
    });
    expect(await completeTranslationJob(lease)).toBe(true);
    expect(await completeTranslationJob(lease)).toBe(false);
    expect(current.completed_at).not.toBeNull();
  });

  it("completes terminal rejections while retaining their operator detail", async () => {
    const current = { ...lease, completed_at: null as number | null, last_error: null as string | null };
    seams.query.mockImplementation(async (_sql, values) => {
      if (values.length === 3) return { rows: [{ ...current }] };
      current.completed_at = values[2];
      current.last_error = values[3];
      return { rows: [] };
    });
    expect(await completeTranslationJob(lease, "Translation completed with 1 rejected segment")).toBe(true);
    expect(current.completed_at).not.toBeNull();
    expect(current.last_error).toBe("Translation completed with 1 rejected segment");
  });

  it("hands public delivery to the publication outbox in the completion transaction", async () => {
    const order: string[] = [];
    seams.query.mockImplementation(async (sql) => {
      order.push(String(sql).includes("SELECT") ? "job-lock" : "job-update");
      return String(sql).includes("SELECT") ? { rows: [{ ...lease, completed_at: null }] } : { rows: [] };
    });
    seams.selectMany.mockImplementation(async () => { order.push("outbox-lock"); return []; });
    seams.insert.mockResolvedValue("publicCachePublications:1");
    const targets = [{ kind: "article-translation" as const, slug: "fixture", locale: "zh-Hans" as const }];
    expect(await completeTranslationJob(lease, null, targets)).toBe(true);
    expect(seams.transaction).toHaveBeenCalledTimes(1);
    // Outbox rows are locked before the job row, the order publication delivery uses.
    expect(order[0]).toBe("outbox-lock");
    expect(seams.insert).toHaveBeenCalledWith(expect.anything(), "publicCachePublications", expect.objectContaining({
      target: targets[0], pending: true, attempts: 0,
      receipts: [expect.objectContaining({ target: "translation-queue", generation: 1 })],
    }));
  });

  it("writes no outbox row when the lease is stale", async () => {
    seams.query.mockResolvedValue({ rows: [{ ...lease, attempts: 2, completed_at: null }] });
    seams.selectMany.mockResolvedValue([]);
    expect(await completeTranslationJob(lease, null, [{ kind: "about" }])).toBe(false);
    expect(seams.insert).not.toHaveBeenCalled();
  });
});

describe("publication generation enqueue", () => {
  it("retains one durable enqueue across delivery retries and ignores old generations", async () => {
    const row = { generation: 2, pending: true, receipts: [] as unknown[] };
    seams.select.mockImplementation(async () => structuredClone(row));
    seams.patch.mockImplementation(async (_client, _table, _id, patch) => Object.assign(row, patch));
    seams.query.mockResolvedValue({ rows: [] });
    await enqueueTranslationJobs(["zh-Hans"], ["fixture"], { publication: { id: "publication", generation: 2 } });
    await enqueueTranslationJobs(["zh-Hans"], ["fixture"], { publication: { id: "publication", generation: 2 } });
    await enqueueTranslationJobs(["zh-Hans"], ["fixture"], { publication: { id: "publication", generation: 1 } });
    expect(seams.query).toHaveBeenCalledTimes(1);
    expect(row.receipts).toEqual([expect.objectContaining({ target: "translation-queue", generation: 2, jobs: ["zh-Hans/fixture"] })]);
  });

  it("cannot record durable intent when queue insertion fails", async () => {
    seams.select.mockResolvedValue({ generation: 2, pending: true, receipts: [] });
    seams.query.mockRejectedValue(new Error("queue insert failed"));
    await expect(enqueueTranslationJobs(["zh-Hans"], ["fixture"], { publication: { id: "publication", generation: 2 } })).rejects.toThrow("queue insert failed");
    expect(seams.patch).not.toHaveBeenCalled();
  });
});

describe("translation job retry schedule", () => {
  it("grows with each failure so five consecutive failures span at least 30 minutes", () => {
    const shortest = Array.from({ length: MAX_TRANSLATION_JOB_ATTEMPTS - 1 }, (_, index) => translationJobRetryDelayMs(index + 1, () => 0));
    expect(shortest).toEqual([...shortest].sort((left, right) => left - right));
    expect(shortest.reduce((sum, delay) => sum + delay, 0)).toBeGreaterThanOrEqual(30 * 60 * 1000);
  });

  it("jitters upward only and caps the delay at one hour", () => {
    expect(translationJobRetryDelayMs(2, () => 1)).toBeGreaterThan(translationJobRetryDelayMs(2, () => 0));
    expect(translationJobRetryDelayMs(40, () => 0)).toBe(60 * 60 * 1000);
  });
});
