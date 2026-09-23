import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seams = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@server/postgres/runtime/backend", () => ({ getDataBackend: () => "postgres" }));
vi.mock("@server/translation/jobWorker", () => ({ runTranslationJobs: seams.refresh }));

import { GET } from "./route";

describe("bulk translation cron", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron-fixture");
    vi.stubEnv("OPENROUTER_API_KEY", "synthetic-fixture");
    seams.refresh.mockResolvedValue({ claimed: 0, completed: 0, failed: 0, cachePending: 0, outcomes: [] });
  });
  afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

  it("runs only the bulk lane within its share of the 100-request ceiling", async () => {
    const response = await GET(new Request("https://editor.dose.wiki/api/cron/translation-bulk", {
      headers: { authorization: "Bearer cron-fixture" },
    }));
    expect(response.status).toBe(200);
    expect(seams.refresh).toHaveBeenCalledWith("synthetic-fixture", {
      mode: "bulk",
      jobsPerRun: 100,
      requestConcurrency: 90,
    });
  });
});
