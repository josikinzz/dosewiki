import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  getPublicSubstances: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@server/data/publicData", () => ({ getPublicSubstances: mocks.getPublicSubstances }));
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));

const substances = ["a", "b", "c"].map((slug) => ({
  slug,
  title: slug.toUpperCase(),
  summary: `${slug} summary`,
  priority: "normal" as const,
  indexCategories: ["test"],
}));

describe("public substances API", () => {
  beforeEach(() => {
    mocks.getPublicSubstances.mockReset().mockResolvedValue(substances);
    mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
  });

  it("returns a cursor-paginated public projection with CORS and CDN caching", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://dose.wiki/api/v1/substances?limit=2"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cdn-cache-control")).toContain("s-maxage=300");
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "publicContentApiRead");
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual(expect.objectContaining({ slug: "a", categories: ["test"] }));
    expect(body.pagination.has_more).toBe(true);

    const second = await GET(new Request(`https://dose.wiki/api/v1/substances?limit=2&cursor=${body.pagination.next_cursor}`));
    await expect(second.json()).resolves.toEqual(expect.objectContaining({
      data: [expect.objectContaining({ slug: "c" })],
      pagination: expect.objectContaining({ has_more: false, next_cursor: null }),
    }));
  });

  it("rejects invalid limits and cursors without querying Postgres", async () => {
    const { GET } = await import("./route");
    const invalidLimit = await GET(new Request("https://dose.wiki/api/v1/substances?limit=500"));
    const invalidCursor = await GET(new Request("https://dose.wiki/api/v1/substances?cursor=bad"));

    expect(invalidLimit.status).toBe(400);
    expect(invalidCursor.status).toBe(400);
    expect(mocks.getPublicSubstances).not.toHaveBeenCalled();
  });

  it("adds CORS to rate-limit responses", async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce(NextResponse.json({ error: "limited" }, { status: 429 }));
    const { GET } = await import("./route");
    const response = await GET(new Request("https://dose.wiki/api/v1/substances"));

    expect(response.status).toBe(429);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });
});
