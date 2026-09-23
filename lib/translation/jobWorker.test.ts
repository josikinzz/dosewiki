import { expect, it, vi } from "vitest";

const seams = vi.hoisted(() => ({ claim: vi.fn(), refresh: vi.fn(), context: vi.fn(async () => ({})) }));
vi.mock("../data/publicData.reads", () => ({ getPublicDataReadAdapter: () => ({}) }));
vi.mock("../data/serverWriteCapability", () => ({ getServerDataWriteCapability: () => ({ ok: false }) }));
vi.mock("../next/publishPublicCache", () => ({ publishPublicCache: vi.fn() }));
vi.mock("./liveTranslation", () => ({
  loadTranslationContext: seams.context,
  parseTranslationJobSlug: (slug: string) => ({ kind: "article", slug }),
  readTranslationRecord: async () => ({}),
  refreshRecordTranslations: seams.refresh,
}));
vi.mock("./segmentStore", () => ({
  claimTranslationJobs: seams.claim,
  completeTranslationJob: async () => true,
  failTranslationJob: vi.fn(),
  acquireTranslationWorkerLease: async () => true,
  releaseTranslationWorkerLease: vi.fn(),
  readTranslationCacheJobs: async () => [],
  completeTranslationCacheJob: vi.fn(),
}));

import { runTranslationJobs } from "./jobWorker";

it("starts the next page while an earlier slow page is still running", async () => {
  let release!: () => void;
  const slow = new Promise<void>((resolve) => { release = resolve; });
  const started: string[] = [];
  const jobs = ["slow", "fast", "next"];
  seams.claim.mockImplementation(async () => {
    const slug = jobs.shift();
    return slug ? [{ slug, locale: "ru", mode: "bulk" }] : [];
  });
  seams.refresh.mockImplementation(async ({ slug }: { slug: string }) => {
    started.push(slug);
    if (slug === "slow") await slow;
    return { slug, locale: "ru", rejected: [], stored: 1 };
  });
  const run = runTranslationJobs("fixture", { mode: "bulk", jobsPerRun: 2, requestConcurrency: 2 });
  try {
    await vi.waitFor(() => expect(started).toContain("next"));
  } finally {
    release();
  }
  expect((await run).completed).toBe(3);
  expect(seams.claim).toHaveBeenCalledWith(1, "bulk");
});

it("loads the current glossary for every newly claimed page", async () => {
  seams.claim.mockReset().mockResolvedValueOnce([{ slug: "one", locale: "ru", mode: "bulk" }])
    .mockResolvedValueOnce([{ slug: "two", locale: "ru", mode: "bulk" }]).mockResolvedValue([]);
  seams.context.mockReset().mockResolvedValueOnce({ glossary: { term: "before" } })
    .mockResolvedValueOnce({ glossary: { term: "after" } });
  seams.refresh.mockReset().mockResolvedValue({ rejected: [], stored: 1 });
  await runTranslationJobs("fixture", { mode: "bulk", jobsPerRun: 1, requestConcurrency: 1 });
  expect(seams.refresh.mock.calls.map((call) => call[1])).toEqual([
    { glossary: { term: "before" } }, { glossary: { term: "after" } },
  ]);
});
