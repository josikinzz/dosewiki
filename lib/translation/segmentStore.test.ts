import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seams = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), sql: vi.fn(), select: vi.fn(), patch: vi.fn() }));
vi.mock("@server/postgres/runtime/backend", () => ({
  getPostgresClient: () => ({ sqlTransaction: seams.transaction, sql: seams.sql }),
}));
vi.mock("../postgres/documentStore", () => ({ selectDocumentById: seams.select, patchDocument: seams.patch }));

import { acquireTranslationWorkerLease, completeTranslationJob, enqueueTranslationJobs, failTranslationJob, releaseTranslationWorkerLease, type TranslationJobRow } from "./segmentStore";

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

  it("creates durable cache work in the completion transaction", async () => {
    seams.query.mockImplementation(async (sql) => String(sql).includes("SELECT")
      ? { rows: [{ ...lease, completed_at: null }] }
      : { rows: [] });
    const targets = [{ kind: "article-translation", slug: "fixture", locale: "zh-Hans" }];
    expect(await completeTranslationJob(lease, null, targets)).toBe(true);
    expect(seams.query).toHaveBeenCalledTimes(3);
    expect(String(seams.query.mock.calls[2]?.[0])).toContain('INSERT INTO "translationCacheJobs"');
    expect(seams.query.mock.calls[2]?.[1]?.[3]).toBe(JSON.stringify(targets));
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
