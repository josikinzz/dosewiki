import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seams = vi.hoisted(() => ({
  claim: vi.fn(), complete: vi.fn(), fail: vi.fn(), refresh: vi.fn(), publish: vi.fn(),
}));
vi.mock("@server/data/publicData.reads", () => ({ getPublicDataReadAdapter: () => ({}) }));
vi.mock("@server/postgres/runtime/backend", () => ({ getDataBackend: () => "postgres" }));
vi.mock("@server/translation/segmentStore", () => ({
  claimTranslationJobs: seams.claim, completeTranslationJob: seams.complete, failTranslationJob: seams.fail,
}));
vi.mock("@server/translation/liveTranslation", () => ({
  parseTranslationJobSlug: (slug: string) => ({ kind: "article", slug }),
  readTranslationRecord: async () => ({ slug: "fixture" }),
  loadTranslationContext: async () => ({}),
  refreshRecordTranslations: seams.refresh,
}));
vi.mock("@server/next/publishPublicCache", () => ({ publishPublicCache: seams.publish }));

import { GET } from "./route";

const outcome = { slug: "fixture", locale: "zh-Hans", segments: 1, requested: 1, stored: 1,
  rejected: [], usage: { prompt: 1, completion: 1, requests: 1 } };
const job = { locale: "zh-Hans", slug: "fixture", requested_at: "1", claimed_at: "2", attempts: 1 };
const request = () => new Request("https://editor.dose.wiki/api/cron/translation-refresh", {
  headers: { authorization: "Bearer cron-fixture" },
});
beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "cron-fixture");
  vi.stubEnv("OPENROUTER_API_KEY", "synthetic-fixture");
  seams.complete.mockResolvedValue(true);
  seams.fail.mockResolvedValue(true);
  seams.publish.mockResolvedValue([{ status: "accepted" }]);
});
afterEach(() => { vi.resetAllMocks(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("translation completion", () => {
  it("records rejected segments as failures and stops when the bounded queue is exhausted", async () => {
    let attempts = 0;
    seams.claim.mockImplementation(async () => attempts < 5 ? [{ ...job, attempts: ++attempts }] : []);
    seams.refresh.mockResolvedValue({ ...outcome, stored: 0, rejected: [{ hash: "bad", defects: ["NUMBER_MISMATCH"] }] });
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ claimed: 5, failed: 5, completed: 0 });
    expect(seams.complete).not.toHaveBeenCalled();
    expect(seams.fail).toHaveBeenCalledTimes(5);
  });

  it("retries cache delivery when the accepted segments need no more model work", async () => {
    seams.claim.mockResolvedValueOnce([job]).mockResolvedValueOnce([{ ...job, attempts: 2 }]).mockResolvedValue([]);
    seams.refresh.mockResolvedValueOnce(outcome).mockResolvedValueOnce({ ...outcome, stored: 0, requested: 0 });
    seams.publish.mockResolvedValueOnce([{ status: "unreachable" }]).mockResolvedValueOnce([{ status: "accepted" }]);
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ claimed: 2, failed: 1, completed: 1 });
    expect(seams.publish).toHaveBeenCalledTimes(2);
    expect(seams.complete).toHaveBeenCalledTimes(1);
  });

  it("abandons an expired request without completing it or claiming more work", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    seams.claim.mockResolvedValue([job]);
    seams.refresh.mockImplementation(async (_record, _context, _kind, _key, signal: AbortSignal) => {
      controller.abort(new Error("cron budget expired"));
      signal.throwIfAborted();
    });
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ claimed: 1, failed: 1, completed: 0 });
    expect(seams.claim).toHaveBeenCalledTimes(1);
    expect(seams.complete).not.toHaveBeenCalled();
    expect(seams.publish).not.toHaveBeenCalled();
  });
});
