import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicHistoryDiff: vi.fn(),
}));

vi.mock("@server/data/publicData.changelog", () => ({ getPublicHistoryDiff: mocks.getPublicHistoryDiff }));

import { GET } from "./route";

const ENTRY_ID = "20260101-000000-abcdef00";

const get = (ip: string, entryId = ENTRY_ID, query = "article=lsd") =>
  GET(
    new Request(`https://dose.wiki/api/history/${entryId}?${query}`, { headers: { "x-forwarded-for": ip } }),
    { params: Promise.resolve({ entryId }) },
  );

describe("public history diff API", () => {
  beforeEach(() => {
    mocks.getPublicHistoryDiff.mockReset().mockResolvedValue("+ corrected duration");
  });

  it("returns a publicly cacheable diff", async () => {
    const response = await get("203.0.113.71");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toMatch(/^public, .*s-maxage=\d+.*stale-while-revalidate=\d+/);
    await expect(response.json()).resolves.toEqual({ markdown: "+ corrected duration" });
    expect(mocks.getPublicHistoryDiff).toHaveBeenCalledWith(ENTRY_ID, "lsd", false);
  });

  it("never caches a missing entry or an outage", async () => {
    mocks.getPublicHistoryDiff.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("postgres down"));

    const missing = await get("203.0.113.72");
    const outage = await get("203.0.113.72");

    expect(missing.status).toBe(404);
    expect(outage.status).toBe(503);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect(outage.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 429 once the public content API policy is spent", async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 121; index += 1) {
      statuses.push((await get("203.0.113.73")).status);
    }

    expect(statuses.slice(0, 120).every((status) => status === 200)).toBe(true);
    expect(statuses[120]).toBe(429);
    expect(mocks.getPublicHistoryDiff).toHaveBeenCalledTimes(120);
  });
});
