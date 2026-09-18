import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicReagentTestBySlug } from "@server/data/publicData.reagents";
import { getCachedReagentDataForArticle } from "./reagentData";

vi.mock("server-only", () => ({}));
vi.mock("@server/data/publicData.reagents", () => ({
  getPublicReagentTestBySlug: vi.fn(),
}));

const cachedResponse = {
  substance: { name: "MDMA", aliases: ["Ecstasy"] },
  reagents: [
    {
      reagent: "marq_desc",
      colors: [{ id: 24, name: "purple", simple: true, simpleColorId: 24 }],
      hint: "purple",
      isReacting: true,
    },
  ],
};

const mockedGetBySlug = vi.mocked(getPublicReagentTestBySlug);

describe("getCachedReagentDataForArticle", () => {
  beforeEach(() => {
    mockedGetBySlug.mockReset();
  });

  it("keeps authored reagent data authoritative", async () => {
    const result = await getCachedReagentDataForArticle(
      { reagent_testing: { marquis: "purple to black" } },
      "mdma",
    );

    expect(result).toBeNull();
    expect(mockedGetBySlug).not.toHaveBeenCalled();
  });

  it("normalizes the Postgres snapshot record found by canonical slug", async () => {
    mockedGetBySlug.mockResolvedValueOnce(cachedResponse);

    const result = await getCachedReagentDataForArticle(
      { reagent_testing: {} },
      "mdma",
    );

    expect(mockedGetBySlug).toHaveBeenCalledWith("mdma");
    expect(result?.substance.name).toBe("MDMA");
    expect(result?.reagents[0]).toMatchObject({
      reagent: "marquis",
      description: "purple",
    });
  });

  it("returns null for an imported no-match record", async () => {
    mockedGetBySlug.mockResolvedValueOnce(null);

    await expect(
      getCachedReagentDataForArticle({ reagent_testing: {} }, "unknown"),
    ).resolves.toBeNull();
  });
});
