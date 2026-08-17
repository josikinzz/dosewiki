import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@server/convex/serverClient", () => ({
  getServerConvexReadClient: () => ({ query: mocks.query }),
}));
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

describe("molecule image route colorways", () => {
  beforeEach(() => {
    mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
    mocks.query.mockReset().mockResolvedValue({
      svg: '<svg><path stroke="#F0ABFC"/><path stroke="#FDA4AF"/></svg>',
    });
  });

  it.each([
    ["brand", "#F0ABFC", "#FDA4AF"],
    ["pro-light", "#333333", "#b0413e"],
    ["pro-dark", "#f2f2f0", "#ef8580"],
  ] as const)("serves the %s byte colorway", async (colorway, carbon, oxygen) => {
    const response = await GET(
      new Request(`https://dose.wiki/api/molecules/lsd?colorway=${colorway}`),
      { params: Promise.resolve({ slug: "lsd" }) },
    );
    const svg = await response.text();

    expect(response.status).toBe(200);
    expect(svg).toContain(carbon);
    expect(svg).toContain(oxygen);
  });

  it("keeps versioned colorways immutable", async () => {
    const response = await GET(
      new Request("https://dose.wiki/api/molecules/lsd?v=1&colorway=pro-dark"),
      { params: Promise.resolve({ slug: "lsd" }) },
    );

    expect(response.headers.get("cache-control")).toContain("immutable");
  });
});
