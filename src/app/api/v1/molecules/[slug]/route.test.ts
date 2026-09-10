import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ query: vi.fn(), enforceRateLimit: vi.fn() }));
vi.mock("@server/convex/serverClient", () => ({ queryConvex: mocks.query }));
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
// The route reads through the persistent public leaf; assert the Convex
// boundary by running the leaf's callback inline.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

describe("public molecule SVG API", () => {
  beforeEach(() => {
    mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
    mocks.query.mockReset().mockResolvedValue({ svg: '<svg><path stroke="#F0ABFC"/></svg>' });
  });

  it("serves all explicit color schemes with public API headers", async () => {
    const context = { params: Promise.resolve({ slug: "mdma.svg" }) };
    const brand = await GET(
      new Request("https://dose.wiki/api/v1/molecules/mdma.svg?scheme=dosewiki"),
      context,
    );
    const effectIndex = await GET(
      new Request("https://dose.wiki/api/v1/molecules/mdma.svg?scheme=effect-index"),
      context,
    );
    const effectIndexDark = await GET(
      new Request("https://dose.wiki/api/v1/molecules/mdma.svg?scheme=effect-index-dark"),
      context,
    );
    expect(brand.headers.get("content-type")).toContain("image/svg+xml");
    expect(brand.headers.get("access-control-allow-origin")).toBe("*");
    expect(await brand.text()).toContain("#F0ABFC");
    expect(await effectIndex.text()).toContain("#333333");
    expect(await effectIndexDark.text()).toContain("#f2f2f0");
  });

  it("rejects unknown schemes before reading Convex", async () => {
    const response = await GET(new Request("https://dose.wiki/api/v1/molecules/mdma.svg?scheme=rainbow"), { params: Promise.resolve({ slug: "mdma.svg" }) });
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns 404 when no Convex depiction row exists", async () => {
    mocks.query.mockResolvedValue(null);
    const response = await GET(new Request("https://dose.wiki/api/v1/molecules/mdma.svg"), {
      params: Promise.resolve({ slug: "mdma.svg" }),
    });
    expect(response.status).toBe(404);
  });
});
