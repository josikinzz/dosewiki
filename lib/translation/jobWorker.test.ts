import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const seam = vi.hoisted(() => ({
  publish: vi.fn(), enqueue: vi.fn(), completeCache: vi.fn(), readCache: vi.fn(),
}));
vi.mock("../data/publicData.reads", () => ({ getPublicDataReadAdapter: () => ({}) }));
vi.mock("../data/serverWriteCapability", () => ({
  getServerDataWriteCapability: () => ({ ok: true, capability: { client: { mutationAsPublicationRecovery: seam.enqueue } } }),
}));
vi.mock("../next/publishPublicCache", () => ({ publishPublicCache: seam.publish }));
vi.mock("./segmentStore", () => ({
  acquireTranslationWorkerLease: async () => true,
  releaseTranslationWorkerLease: async () => {},
  readTranslationCacheJobs: seam.readCache,
  completeTranslationCacheJob: seam.completeCache,
  claimTranslationJobs: async () => [],
}));

import { runTranslationJobs } from "./jobWorker";

beforeEach(() => {
  seam.publish.mockReset().mockResolvedValue([{ status: "failed" }]);
  seam.enqueue.mockReset().mockResolvedValue(undefined);
  seam.completeCache.mockReset().mockResolvedValue(undefined);
  seam.readCache.mockReset().mockResolvedValue([{ locale: "es", slug: "article:lsd", mode: "incremental", targets: '[{"kind":"article-translation","slug":"lsd","locale":"es"}]' }]);
});

describe("translation cache recovery", () => {
  it("queues failed cache publication before clearing its durable job", async () => {
    const run = await runTranslationJobs("model-key", { mode: "incremental", jobsPerRun: 1, requestConcurrency: 1 });
    expect(run.cachePending).toBe(1);
    expect(seam.enqueue).toHaveBeenCalledTimes(1);
    expect(seam.completeCache).toHaveBeenCalledTimes(1);
    expect(seam.enqueue.mock.invocationCallOrder[0]).toBeLessThan(seam.completeCache.mock.invocationCallOrder[0]);
  });

  it("retains the durable job when recovery enqueue fails", async () => {
    seam.enqueue.mockRejectedValue(new Error("database unavailable"));
    const run = await runTranslationJobs("model-key", { mode: "incremental", jobsPerRun: 1, requestConcurrency: 1 });
    expect(run.cachePending).toBe(1);
    expect(seam.completeCache).not.toHaveBeenCalled();
  });
});
