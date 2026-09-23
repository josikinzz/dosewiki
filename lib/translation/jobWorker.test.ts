import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const seam = vi.hoisted(() => ({
  publish: vi.fn(), enqueue: vi.fn(), completeCache: vi.fn(), readCache: vi.fn(),
  claim: vi.fn(), complete: vi.fn(), fail: vi.fn(), record: vi.fn(), acquire: vi.fn(), refresh: vi.fn(),
}));
vi.mock("../data/publicData.reads", () => ({ getPublicDataReadAdapter: () => ({}) }));
vi.mock("../data/serverWriteCapability", () => ({
  getServerDataWriteCapability: () => ({ ok: true, capability: { client: { mutationAsPublicationRecovery: seam.enqueue } } }),
}));
vi.mock("../next/publishPublicCache", () => ({ publishPublicCache: seam.publish }));
vi.mock("./segmentStore", () => ({
  MAX_TRANSLATION_JOB_ATTEMPTS: 5,
  acquireTranslationWorkerLease: seam.acquire,
  releaseTranslationWorkerLease: async () => {},
  readTranslationCacheJobs: seam.readCache,
  completeTranslationCacheJob: seam.completeCache,
  claimTranslationJobs: seam.claim,
  completeTranslationJob: seam.complete,
  failTranslationJob: seam.fail,
  recordTranslationWorkerRun: seam.record,
}));
vi.mock("./liveTranslation", () => ({
  parseTranslationJobSlug: (slug: string) => ({ kind: "article", slug }),
  readTranslationRecord: async () => ({ slug: "fixture" }),
  loadTranslationContext: async () => ({}),
  refreshRecordTranslations: seam.refresh,
}));

import { runTranslationJobs } from "./jobWorker";

const config = { mode: "incremental" as const, jobsPerRun: 1, requestConcurrency: 1 };
const job = (slug: string, attempts = 1) => ({
  locale: "es", slug, requested_at: "1", claimed_at: "2", attempts, mode: "incremental" as const,
});
const outcome = (slug: string) => ({
  slug, locale: "es", segments: 2, requested: 2, stored: 2, rejected: [],
  usage: { prompt: 10, completion: 20, requests: 1 },
});

beforeEach(() => {
  seam.publish.mockReset().mockResolvedValue([{ status: "failed" }]);
  seam.enqueue.mockReset().mockResolvedValue(undefined);
  seam.completeCache.mockReset().mockResolvedValue(undefined);
  seam.readCache.mockReset().mockResolvedValue([{ locale: "es", slug: "article:lsd", mode: "incremental", targets: '[{"kind":"article-translation","slug":"lsd","locale":"es"}]' }]);
  seam.claim.mockReset().mockResolvedValue([]);
  seam.complete.mockReset().mockResolvedValue(true);
  seam.fail.mockReset().mockResolvedValue(true);
  seam.record.mockReset().mockResolvedValue(undefined);
  seam.acquire.mockReset().mockResolvedValue(true);
  seam.refresh.mockReset();
});
afterEach(() => { vi.restoreAllMocks(); });

describe("translation cache recovery", () => {
  it("queues failed cache publication before clearing its durable job", async () => {
    const run = await runTranslationJobs("model-key", config);
    expect(run.cachePending).toBe(1);
    expect(seam.enqueue).toHaveBeenCalledTimes(1);
    expect(seam.completeCache).toHaveBeenCalledTimes(1);
    expect(seam.enqueue.mock.invocationCallOrder[0]).toBeLessThan(seam.completeCache.mock.invocationCallOrder[0]);
  });

  it("retains the durable job when recovery enqueue fails", async () => {
    seam.enqueue.mockRejectedValue(new Error("database unavailable"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const run = await runTranslationJobs("model-key", config);
    expect(run.cachePending).toBe(1);
    expect(seam.completeCache).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("[translation-worker] cache:failed", expect.objectContaining({
      locale: "es", slug: "article:lsd", mode: "incremental", message: "database unavailable",
    }));
  });
});

describe("translation worker run record", () => {
  beforeEach(() => {
    seam.readCache.mockResolvedValue([]);
  });

  it("writes exactly one run row whose counts match the returned result", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    seam.claim
      .mockResolvedValueOnce([job("lsd"), job("dmt", 5)])
      .mockResolvedValueOnce([job("mdma")])
      .mockResolvedValue([]);
    type Options = { onUsage?: (used: { prompt: number; completion: number }) => void };
    seam.refresh.mockImplementation(async (record: { slug: string }, _context, _kind, _key, options: Options) => {
      // A failed record still paid for the requests it sent before failing.
      options.onUsage?.({ prompt: 10, completion: 20 });
      if (record.slug === "dmt") throw new Error("provider unavailable");
      return outcome(record.slug);
    });
    const run = await runTranslationJobs("model-key", { ...config, jobsPerRun: 2 });

    expect(run).toMatchObject({
      mode: "incremental", leaseHeld: true, claimed: 3, completed: 2, failed: 1, exhausted: 1,
      usage: { prompt: 30, completion: 60, requests: 3 }, firstError: "provider unavailable",
    });
    expect(seam.record).toHaveBeenCalledTimes(1);
    const [row] = seam.record.mock.calls[0];
    expect(row).toMatchObject({
      mode: run.mode, leaseHeld: run.leaseHeld, claimed: run.claimed, completed: run.completed,
      failed: run.failed, exhausted: run.exhausted, cachePending: run.cachePending,
      usage: run.usage, durationMs: run.durationMs, firstError: run.firstError,
    });
    expect(typeof row.id).toBe("string");
    expect(typeof row.startedAt).toBe("number");
  });

  it("logs a failed job with its identity and a readable message", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    seam.claim.mockResolvedValueOnce([job("lsd")]).mockResolvedValue([]);
    // The provider wrapper once threw plain objects; the log must still read as text.
    seam.refresh.mockRejectedValue({ status: 402, message: "Insufficient credits", retryable: false });
    const run = await runTranslationJobs("model-key", config);

    expect(run.failed).toBe(1);
    expect(error).toHaveBeenCalledWith("[translation-worker] job:failed", expect.objectContaining({
      locale: "es", slug: "lsd", mode: "incremental", message: "Insufficient credits",
    }));
    expect(seam.fail).toHaveBeenCalledWith(expect.objectContaining({ slug: "lsd" }), "Insufficient credits", { progressed: false });
    for (const call of [...error.mock.calls, ...seam.fail.mock.calls, ...seam.record.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain("[object Object]");
    }
  });

  it("records a lease-denied run instead of returning an idle-looking result", async () => {
    seam.acquire.mockResolvedValue(false);
    const run = await runTranslationJobs("model-key", config);

    expect(run).toMatchObject({ leaseHeld: false, claimed: 0 });
    expect(seam.claim).not.toHaveBeenCalled();
    expect(seam.record).toHaveBeenCalledTimes(1);
    expect(seam.record.mock.calls[0][0]).toMatchObject({ mode: "incremental", leaseHeld: false });
  });

  it("returns the run when the run row cannot be stored", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    seam.record.mockRejectedValue(new Error("run log unavailable"));
    const run = await runTranslationJobs("model-key", config);

    expect(run.leaseHeld).toBe(true);
    expect(error).toHaveBeenCalledWith("[translation-worker] run:unrecorded", expect.objectContaining({
      mode: "incremental", message: "run log unavailable",
    }));
  });
});

describe("translation job budget abort", () => {
  type Options = { signal: AbortSignal; onStored?: (count: number) => void };
  beforeEach(() => {
    seam.readCache.mockResolvedValue([]);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const abortDuring = (stored: number) => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    seam.claim.mockResolvedValueOnce([job("lsd")]).mockResolvedValue([]);
    seam.refresh.mockImplementation(async (_record, _context, _kind, _key, options: Options) => {
      if (stored > 0) options.onStored?.(stored);
      controller.abort(new Error("run budget reached"));
      options.signal.throwIfAborted();
    });
  };

  it("keeps the attempt when the record stored segments before the budget ran out", async () => {
    abortDuring(3);
    await runTranslationJobs("model-key", config);
    expect(seam.fail).toHaveBeenCalledWith(expect.objectContaining({ slug: "lsd" }), "run budget reached", { progressed: true });
  });

  it("spends the attempt when the budget ran out before anything was stored", async () => {
    abortDuring(0);
    await runTranslationJobs("model-key", config);
    expect(seam.fail).toHaveBeenCalledWith(expect.objectContaining({ slug: "lsd" }), "run budget reached", { progressed: false });
  });
});

describe("translation transport failures", () => {
  it("fail the job and tag the log with the transport defect code", async () => {
    seam.readCache.mockResolvedValue([]);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    seam.claim.mockResolvedValueOnce([job("lsd")]).mockResolvedValue([]);
    seam.refresh.mockRejectedValue(Object.assign(new Error("Provider request failed: Insufficient credits"), {
      code: "TRANSPORT_FAILURE", status: 402,
    }));
    const run = await runTranslationJobs("model-key", config);

    expect(run).toMatchObject({ failed: 1, completed: 0 });
    expect(seam.complete).not.toHaveBeenCalled();
    expect(seam.fail).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "lsd" }), "Provider request failed: Insufficient credits", { progressed: false },
    );
    expect(error).toHaveBeenCalledWith("[translation-worker] job:failed", expect.objectContaining({
      slug: "lsd", code: "TRANSPORT_FAILURE", status: 402,
    }));
  });
});
