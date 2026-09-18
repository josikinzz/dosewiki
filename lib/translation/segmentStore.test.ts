import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seams = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), select: vi.fn(), patch: vi.fn() }));
vi.mock("@server/postgres/runtime/backend", () => ({
  getPostgresClient: () => ({ sqlTransaction: seams.transaction }),
}));
vi.mock("../postgres/documentStore", () => ({ selectDocumentById: seams.select, patchDocument: seams.patch }));

import { completeTranslationJob, enqueueTranslationJobs, failTranslationJob, type TranslationJobRow } from "./segmentStore";

const lease: TranslationJobRow = {
  locale: "zh-Hans", slug: "fixture", requested_at: "1000", claimed_at: "1001", attempts: 1,
};

beforeEach(() => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  seams.transaction.mockImplementation(async (operation) => operation({ query: seams.query }));
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
      if (values.length === 2) return { rows: [{ ...current }] };
      current.completed_at = values[2];
      return { rows: [] };
    });
    expect(await completeTranslationJob(lease)).toBe(true);
    expect(await completeTranslationJob(lease)).toBe(false);
    expect(current.completed_at).not.toBeNull();
  });
});

describe("publication generation enqueue", () => {
  it("retains one durable enqueue across delivery retries and ignores old generations", async () => {
    const row = { generation: 2, pending: true, receipts: [] as unknown[] };
    seams.select.mockImplementation(async () => structuredClone(row));
    seams.patch.mockImplementation(async (_client, _table, _id, patch) => Object.assign(row, patch));
    seams.query.mockResolvedValue({ rows: [] });
    await enqueueTranslationJobs(["zh-Hans"], ["fixture"], { id: "publication", generation: 2 });
    await enqueueTranslationJobs(["zh-Hans"], ["fixture"], { id: "publication", generation: 2 });
    await enqueueTranslationJobs(["zh-Hans"], ["fixture"], { id: "publication", generation: 1 });
    expect(seams.query).toHaveBeenCalledTimes(1);
    expect(row.receipts).toEqual([expect.objectContaining({ target: "translation-queue", generation: 2, jobs: ["zh-Hans/fixture"] })]);
  });

  it("cannot record durable intent when queue insertion fails", async () => {
    seams.select.mockResolvedValue({ generation: 2, pending: true, receipts: [] });
    seams.query.mockRejectedValue(new Error("queue insert failed"));
    await expect(enqueueTranslationJobs(["zh-Hans"], ["fixture"], { id: "publication", generation: 2 })).rejects.toThrow("queue insert failed");
    expect(seams.patch).not.toHaveBeenCalled();
  });
});
