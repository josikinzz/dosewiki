import { beforeEach, describe, expect, it, vi } from "vitest";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const mocks = vi.hoisted(() => ({
  queryConvex: vi.fn(),
}));

vi.mock("./serverClient", () => ({
  queryConvex: mocks.queryConvex,
}));

describe("public substance data adapters", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.queryConvex.mockReset();
  });

  it("reads public library inputs from the projected Convex query", async () => {
    mocks.queryConvex.mockResolvedValueOnce([
      {
        ...fullArticleWithDosage,
        slug: "lsd",
      },
    ]);

    const { getRawSubstances } = await import("./publicData.substances");
    const result = await getRawSubstances();

    expect(mocks.queryConvex).toHaveBeenCalledWith("substanceIndex:getPublicLibraryInput", {});
    expect(result[0]).toMatchObject({ title: "LSD", slug: "lsd" });
  });

  it("reads public list, lookup, and article data from projected substance queries", async () => {
    mocks.queryConvex
      .mockResolvedValueOnce([{ slug: "lsd", name: "LSD", priority: "high" }])
      .mockResolvedValueOnce([{ title: "LSD", slug: "lsd", summary: "Acid", priority: "high", indexCategories: [] }])
      .mockResolvedValueOnce({ ...fullArticleWithDosage, slug: "lsd" });

    const {
      getPublicSubstanceBySlug,
      getPublicSubstanceLookup,
      getPublicSubstances,
    } = await import("./publicData.substances");

    await expect(getPublicSubstanceLookup()).resolves.toEqual([
      { slug: "lsd", name: "LSD", priority: "high" },
    ]);
    await expect(getPublicSubstances()).resolves.toHaveLength(1);
    await expect(getPublicSubstanceBySlug("lsd")).resolves.toMatchObject({ slug: "lsd" });

    expect(mocks.queryConvex).toHaveBeenNthCalledWith(1, "substanceIndex:getPublicLookup", {});
    expect(mocks.queryConvex).toHaveBeenNthCalledWith(2, "substanceIndex:getPublicPreviews", {});
    expect(mocks.queryConvex).toHaveBeenNthCalledWith(3, "substanceIndex:getPublicBySlug", { slug: "lsd" });
  });

  it("filters malformed public library records returned from Convex", async () => {
    mocks.queryConvex.mockResolvedValueOnce([
      {
        ...fullArticleWithDosage,
        slug: "lsd",
      },
      {
        title: "Broken",
        slug: "broken",
        classification: { psychoactive_class: "Psychedelic" },
      },
    ]);

    const { getRawSubstances } = await import("./publicData.substances");

    await expect(getRawSubstances()).resolves.toEqual([expect.objectContaining({ slug: "lsd" })]);
  });
});
