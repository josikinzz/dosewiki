import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("projects library inputs from the stable raw substance query", async () => {
    mocks.queryConvex.mockResolvedValueOnce([
      {
        id: 1,
        title: "LSD",
        slug: "lsd",
        priority: "high",
        index_categories: ["Psychedelic"],
      },
    ]);

    const { getRawSubstances } = await import("./publicData.substances");
    const result = await getRawSubstances();

    expect(mocks.queryConvex).toHaveBeenCalledWith("substanceIndex:getAll", {});
    expect(result[0]).toMatchObject({ title: "LSD", slug: "lsd" });
  });

  it("derives public list, lookup, and article reads from stable substance queries", async () => {
    mocks.queryConvex
      .mockResolvedValueOnce([{ title: "LSD", slug: "lsd", summary: "Acid", priority: "high", index_categories: [] }])
      .mockResolvedValueOnce([{ title: "LSD", slug: "lsd", summary: "Acid", priority: "high", index_categories: [] }])
      .mockResolvedValueOnce({ title: "LSD", slug: "lsd", priority: "high", index_categories: [] });

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

    expect(mocks.queryConvex).toHaveBeenNthCalledWith(1, "substanceIndex:getAll", {});
    expect(mocks.queryConvex).toHaveBeenNthCalledWith(2, "substanceIndex:getAll", {});
    expect(mocks.queryConvex).toHaveBeenNthCalledWith(3, "substanceIndex:getBySlug", { slug: "lsd" });
  });
});
