import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seams = vi.hoisted(() => ({
  claim: vi.fn(), complete: vi.fn(), fail: vi.fn(), refresh: vi.fn(), applyLocally: vi.fn(),
  acquire: vi.fn(), release: vi.fn(), record: vi.fn(),
}));
vi.mock("@server/data/publicData.reads", () => ({ getPublicDataReadAdapter: () => ({}) }));
vi.mock("@server/postgres/runtime/backend", () => ({ getDataBackend: () => "postgres" }));
vi.mock("@server/translation/segmentStore", () => ({
  claimTranslationJobs: seams.claim, completeTranslationJob: seams.complete, failTranslationJob: seams.fail,
  acquireTranslationWorkerLease: seams.acquire, releaseTranslationWorkerLease: seams.release,
  recordTranslationWorkerRun: seams.record, MAX_TRANSLATION_JOB_ATTEMPTS: 5,
}));
vi.mock("@server/translation/liveTranslation", () => ({
  parseTranslationJobSlug: (slug: string) => ({ kind: "article", slug }),
  readTranslationRecord: async () => ({ slug: "fixture" }),
  loadTranslationContext: async () => ({}),
  refreshRecordTranslations: seams.refresh,
}));
vi.mock("@server/next/publishPublicCache", () => ({ applyPublicCacheLocally: seams.applyLocally }));

import { GET } from "./route";

const outcome = { slug: "fixture", locale: "zh-Hans", segments: 1, requested: 1, stored: 1,
  rejected: [], usage: { prompt: 1, completion: 1, requests: 1 } };
const job = { locale: "zh-Hans", slug: "fixture", requested_at: "1", claimed_at: "2", attempts: 1, mode: "incremental" };
const request = () => new Request("https://editor.dose.wiki/api/cron/translation-refresh", {
  headers: { authorization: "Bearer cron-fixture" },
});
beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "cron-fixture");
  vi.stubEnv("OPENROUTER_API_KEY", "synthetic-fixture");
  seams.complete.mockResolvedValue(true);
  seams.fail.mockResolvedValue(true);
  seams.acquire.mockResolvedValue(true);
  seams.release.mockResolvedValue(undefined);
  seams.record.mockResolvedValue(undefined);
});
afterEach(() => { vi.resetAllMocks(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("translation completion", () => {
  it("completes a record with terminal rejection detail instead of retrying forever", async () => {
    seams.claim.mockResolvedValueOnce([job]).mockResolvedValue([]);
    seams.refresh.mockResolvedValue({ ...outcome, stored: 0, rejected: [{ hash: "bad", defects: ["NUMBER_MISMATCH"] }] });
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ claimed: 1, failed: 0, completed: 1 });
    expect(seams.complete).toHaveBeenCalledWith(job, "Translation completed with 1 rejected segment", [
      { kind: "article-translation", slug: "fixture", locale: "zh-Hans" },
    ]);
    expect(seams.fail).not.toHaveBeenCalled();
    expect(seams.claim).toHaveBeenCalledWith(1, "incremental");
  });

  it("completes translation and leaves public delivery to the publication outbox", async () => {
    seams.claim.mockResolvedValueOnce([job]).mockResolvedValue([]);
    seams.refresh.mockResolvedValue(outcome);
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ claimed: 1, failed: 0, completed: 1, cachePending: 1 });
    expect(seams.complete).toHaveBeenCalledWith(job, null, [{ kind: "article-translation", slug: "fixture", locale: "zh-Hans" }]);
    expect(seams.applyLocally).toHaveBeenCalledTimes(1);
    expect(seams.fail).not.toHaveBeenCalled();
  });

  it("abandons an expired request without completing it or claiming more work", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    seams.claim.mockResolvedValue([job]);
    seams.refresh.mockImplementation(async (_record, _context, _kind, _key, options: { signal: AbortSignal }) => {
      controller.abort(new Error("cron budget expired"));
      options.signal.throwIfAborted();
    });
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ claimed: 1, failed: 1, completed: 0 });
    expect(seams.claim).toHaveBeenCalledTimes(1);
    expect(seams.complete).not.toHaveBeenCalled();
    expect(seams.applyLocally).not.toHaveBeenCalled();
  });
});
