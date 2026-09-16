import { beforeEach, describe, expect, it, vi } from "vitest";
import { fullArticleWithDosage } from "@/test/fixtures/articles";

const mocks = vi.hoisted(() => ({
  getPublicSubstanceBySlug: vi.fn(),
  enforceRateLimit: vi.fn(),
  getCachedReagentDataForArticle: vi.fn(),
}));

vi.mock("@server/data/publicData", () => ({ getPublicSubstanceBySlug: mocks.getPublicSubstanceBySlug }));
vi.mock("@server/reagentData", () => ({ getCachedReagentDataForArticle: mocks.getCachedReagentDataForArticle }));
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));

describe("public substance detail API", () => {
  beforeEach(() => {
    mocks.getPublicSubstanceBySlug.mockReset().mockResolvedValue({
      ...fullArticleWithDosage,
      id: 1,
      slug: "mdma",
      title: "MDMA",
      summary: "Summary",
      priority: "high",
      index_categories: ["entactogen"],
      expert_reviewed: true,
    });
    mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
    mocks.getCachedReagentDataForArticle.mockReset().mockResolvedValue(null);
  });

  it("returns the complete public projection and canonical URL", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://dose.wiki/api/v1/substances/mdma"),
      { params: Promise.resolve({ slug: "mdma" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toEqual({
      data: expect.objectContaining({
        slug: "mdma",
        expert_reviewed: true,
        url: "https://dose.wiki/mdma",
        reagent_testing_normalized: expect.any(Object),
        molecule: expect.any(Object),
      }),
      meta: { api_version: "v1" },
    });
  });

  it("rejects malformed slugs before reading data", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://dose.wiki/api/v1/substances/MDMA!"),
      { params: Promise.resolve({ slug: "MDMA!" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.getPublicSubstanceBySlug).not.toHaveBeenCalled();
  });

  it("returns the versioned not-found envelope", async () => {
    mocks.getPublicSubstanceBySlug.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://dose.wiki/api/v1/substances/unknown"),
      { params: Promise.resolve({ slug: "unknown" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: "not_found", message: "Substance not found." },
      meta: { api_version: "v1" },
    });
  });
});
