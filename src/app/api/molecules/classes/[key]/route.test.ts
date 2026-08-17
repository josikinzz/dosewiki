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

describe("class molecule image route colorways", () => {
  beforeEach(() => {
    mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
    mocks.query.mockReset().mockResolvedValue({
      svg: '<svg><path stroke="#F0ABFC"/><path stroke="#C084FC"/></svg>',
    });
  });

  it("serves the dark Pro palette for Convex class overrides", async () => {
    const response = await GET(
      new Request("https://dose.wiki/api/molecules/classes/tryptamine?colorway=pro-dark"),
      { params: Promise.resolve({ key: "tryptamine" }) },
    );
    const svg = await response.text();

    expect(response.status).toBe(200);
    expect(svg).toContain("#f2f2f0");
    expect(svg).toContain("#6fc4bb");
  });

  it("leaves the canonical bytes unchanged for Fun", async () => {
    const response = await GET(
      new Request("https://dose.wiki/api/molecules/classes/tryptamine?colorway=brand"),
      { params: Promise.resolve({ key: "tryptamine" }) },
    );

    expect(await response.text()).toContain("#F0ABFC");
  });
});
