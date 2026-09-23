import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertDataWritesNotFrozen } from "@server/runtime/dataWriteFreeze";

// Each seam refuses the way the real writer does: the Postgres client and the
// translation segment store both call `assertDataWritesNotFrozen` before any
// statement, and nothing on the way back to the route catches that refusal.
vi.mock("@server/postgres/runtime/backend", () => ({ getDataBackend: () => "postgres" }));
vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: () => ({
    ok: true,
    capability: {
      client: {
        mutationAsService: async () => {
          assertDataWritesNotFrozen("publicationRecovery:claimDue");
          return [];
        },
      },
    },
  }),
}));
vi.mock("@server/translation/jobWorker", () => ({
  runTranslationJobs: async () => {
    assertDataWritesNotFrozen("acquireTranslationWorkerLease");
    return { claimed: 0, completed: 0, failed: 0, cachePending: 0, outcomes: [] };
  },
}));

const rateLimit = vi.hoisted(() => ({ enforceRateLimit: vi.fn(async () => null as Response | null) }));
vi.mock("@server/http/nextRateLimit", () => rateLimit);
vi.mock("@server/data/publicData", () => ({ getPublicSubstanceLookup: async () => ({}) }));
vi.mock("../warm/warmPolicy", () => ({
  parseWarmSearchParams: () => ({ concurrency: 1, budgetMs: 1000, includeLow: false, rotate: 0, maxUrls: 0 }),
  planWarmTargets: () => [],
  warmRotationForTick: () => 0,
}));

import { GET as publicationDelivery } from "./publication-delivery/route";
import { GET as translationBulk } from "./translation-bulk/route";
import { GET as translationRefresh } from "./translation-refresh/route";
import { GET as warm } from "../warm/route";

const writerCrons = [
  ["publication-delivery", publicationDelivery],
  ["translation-bulk", translationBulk],
  ["translation-refresh", translationRefresh],
] as const;

const cronRequest = (name: string) =>
  new Request(`https://editor.dose.wiki/api/cron/${name}`, {
    headers: { authorization: "Bearer cron-fixture" },
  });

describe("writer crons under a write freeze", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron-fixture");
    vi.stubEnv("OPENROUTER_API_KEY", "synthetic-fixture");
    // CI runs with the freeze on; the frozen cases set it themselves.
    vi.stubEnv("DATA_WRITES_FROZEN", "0");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(writerCrons)("%s returns 503 with frozen: true", async (name, GET) => {
    vi.stubEnv("DATA_WRITES_FROZEN", "1");

    const response = await GET(cronRequest(name));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ frozen: true });
  });

  it.each(writerCrons)("%s still refuses a wrong secret before anything else", async (name, GET) => {
    vi.stubEnv("DATA_WRITES_FROZEN", "1");

    const response = await GET(
      new Request(`https://editor.dose.wiki/api/cron/${name}`, {
        headers: { authorization: "Bearer cron-fixturf" },
      }),
    );

    expect(response.status).toBe(401);
  });

  it.each(writerCrons)("%s runs normally when writes are open", async (name, GET) => {
    const response = await GET(cronRequest(name));

    expect(response.status).toBe(200);
  });
});

describe("the warm cron", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron-fixture");
    vi.stubEnv("DATA_WRITES_FROZEN", "0");
    rateLimit.enforceRateLimit.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses a wrong secret, after spending the rate limit", async () => {
    const response = await warm(
      new Request("https://dose.wiki/api/warm", { headers: { authorization: "Bearer cron-fixturf" } }),
    );

    expect(response.status).toBe(401);
    expect(rateLimit.enforceRateLimit).toHaveBeenCalledOnce();
  });

  it("answers a limited caller before looking at its secret", async () => {
    rateLimit.enforceRateLimit.mockResolvedValueOnce(Response.json({ error: "Too many requests." }, { status: 429 }));

    const response = await warm(new Request("https://dose.wiki/api/warm"));

    expect(response.status).toBe(429);
  });

  it("runs with the secret", async () => {
    const response = await warm(
      new Request("https://dose.wiki/api/warm", { headers: { authorization: "Bearer cron-fixture" } }),
    );

    expect(response.status).toBe(200);
  });
});
