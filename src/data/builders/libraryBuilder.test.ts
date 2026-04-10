import { describe, expect, it, vi } from "vitest";
import { buildLibrary } from "./libraryBuilder";
import { parseManualConfig } from "./manualIndexLoader";
import { fullArticleWithDosage, minimalArticle } from "@/test/fixtures/articles";

vi.mock("@/data/mappings/moleculeSvgMappings.json", () => ({
  default: { mappings: [] },
}));

const emptyConfig = parseManualConfig({
  version: 1,
  categories: [
    {
      key: "miscellaneous",
      label: "Miscellaneous",
      iconKey: "sparkles",
      drugs: [],
      sections: [],
    },
  ],
});

describe("buildLibrary", () => {
  it("stitches interaction and taxonomy pipelines into library lookups", () => {
    const lithiumArticle = {
      ...minimalArticle,
      id: 2,
      title: "Lithium",
      identification: {
        ...minimalArticle.identification,
        common_name: "Lithium",
      },
      classification: {
        psychoactive_class: ["Mood Stabilizer"],
        chemical_class: ["Alkali Metal"],
      },
    };

    const library = buildLibrary(
      [fullArticleWithDosage, lithiumArticle],
      {
        psychoactive: emptyConfig,
        chemical: emptyConfig,
        mechanism: emptyConfig,
      },
    );

    expect(library.substanceBySlug.get("lsd")?.name).toBe("LSD");
    expect(library.interactionIndex.get("lithium")?.matchedSubstanceSlug).toBe("lithium");
    expect(library.getChemicalClassDetail("lysergamide")?.total).toBe(1);
    expect(library.getMechanismSummary("5-ht2a-receptor-agonist")?.total).toBe(1);
  });
});
