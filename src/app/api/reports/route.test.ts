import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getReportBrowsePage: vi.fn(),
}));

vi.mock("@server/next/reportBrowse", () => ({ getReportBrowsePage: mocks.getReportBrowsePage }));

import { GET } from "./route";

const request = (query: string, ip: string) =>
  new Request(`https://dose.wiki/api/reports?${query}`, { headers: { "x-forwarded-for": ip } });

describe("public reports browse API", () => {
  beforeEach(() => {
    mocks.getReportBrowsePage.mockReset().mockResolvedValue({ items: [], cursor: null });
  });

  it("returns a publicly cacheable page", async () => {
    const response = await GET(request("view=title&q=walk", "203.0.113.61"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toMatch(/^public, .*s-maxage=\d+.*stale-while-revalidate=\d+/);
    await expect(response.json()).resolves.toEqual({ items: [], cursor: null });
  });

  it("never caches a refusal", async () => {
    const invalid = await GET(request("view=nope", "203.0.113.62"));

    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 429 once the public content API policy is spent", async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 121; index += 1) {
      statuses.push((await GET(request(`view=title&q=${index}`, "203.0.113.63"))).status);
    }

    expect(statuses.slice(0, 120).every((status) => status === 200)).toBe(true);
    expect(statuses[120]).toBe(429);
    expect(mocks.getReportBrowsePage).toHaveBeenCalledTimes(120);
  });
});
