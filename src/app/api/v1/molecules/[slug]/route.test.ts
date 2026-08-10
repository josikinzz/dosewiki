import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), enforceRateLimit: vi.fn() }));
vi.mock("@server/convex/serverClient", () => ({ getServerConvexReadClient: () => ({ query: mocks.query }) }));
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));

describe("public molecule SVG API", () => {
  beforeEach(() => {
    mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
    mocks.query.mockReset().mockResolvedValue({ svg: '<svg><path stroke="#F0ABFC"/></svg>' });
  });

  it("serves explicit dosewiki and Effect Index schemes with public API headers", async () => {
    const { GET } = await import("./route");
    const context = { params: Promise.resolve({ slug: "mdma.svg" }) };
    const brand = await GET(new Request("https://dose.wiki/api/v1/molecules/mdma.svg?scheme=dosewiki"), context);
    const effectIndex = await GET(new Request("https://dose.wiki/api/v1/molecules/mdma.svg?scheme=effect-index"), context);
    expect(brand.headers.get("content-type")).toContain("image/svg+xml");
    expect(brand.headers.get("access-control-allow-origin")).toBe("*");
    expect(await brand.text()).toContain("#F0ABFC");
    expect(await effectIndex.text()).toContain("#333333");
  });

  it("rejects unknown schemes before reading Convex", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://dose.wiki/api/v1/molecules/mdma.svg?scheme=rainbow"), { params: Promise.resolve({ slug: "mdma.svg" }) });
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
