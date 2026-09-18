import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { fullArticleWithDosage, hiddenArticle, minimalArticle } from "@/test/fixtures/articles";
import type { SubstanceArticle } from "@/schema";
import { projectArticleNormalization } from "./articleNormalization";
import { projectManualIndexes } from "./manualIndexProjection";
import { createPublicLibraryFacade } from "./publicLibraryFacade";
import { projectTaxonomy } from "./taxonomyProjection";
import { buildInteractionIndex } from "./libraryBuilderInteractions";
import { parseManualConfig } from "./manualIndexLoader";

const manualConfig = parseManualConfig({
  version: 1,
  categories: [
    {
      key: "psychedelics",
      label: "Psychedelics",
      iconKey: "sparkles",
      drugs: ["lsd"],
      sections: [
        {
          key: "classic",
          label: "Classic",
          drugs: ["psilocybin"],
        },
      ],
    },
    {
      key: "miscellaneous",
      label: "Miscellaneous",
      iconKey: "circle",
      drugs: [],
      sections: [],
    },
  ],
});

const autoFallbackConfig = parseManualConfig({
  version: 1,
  categories: [
    {
      key: "configured-empty",
      label: "Configured Empty",
      iconKey: "circle",
      drugs: [],
      sections: [],
    },
  ],
});

const configs = {
  psychoactive: manualConfig,
  chemical: autoFallbackConfig,
  mechanism: autoFallbackConfig,
};

const makeArticle = (
  overrides: Partial<SubstanceArticle> & Pick<SubstanceArticle, "id" | "title">,
): SubstanceArticle => ({
  ...createEmptyArticle(),
  id: overrides.id,
  title: overrides.title,
  identification: {
    ...createEmptyArticle().identification,
    common_name: overrides.title,
    alternative_names: [],
  },
  ...overrides,
});

describe("library projection modules", () => {
  it("normalizes raw articles into complete and public record projections", () => {
    const distinctHiddenArticle = {
      ...hiddenArticle,
      identification: {
        ...hiddenArticle.identification,
        common_name: "Hidden Substance",
      },
    };
    const lowPriorityArticle = makeArticle({
      id: 7,
      title: "Low Priority Substance",
      priority: "low",
    });
    const hiddenForNowArticle = makeArticle({
      id: 8,
      title: "Hidden For Now Substance",
      priority: "hide_for_now",
    });

    const projection = projectArticleNormalization([
      minimalArticle,
      distinctHiddenArticle,
      lowPriorityArticle,
      hiddenForNowArticle,
    ]);

    expect(projection.allSubstanceRecords.map((record) => record.slug)).toEqual([
      "test-substance",
      "hidden-substance",
      "low-priority-substance",
      "hidden-for-now-substance",
    ]);
    expect(projection.substanceRecords.map((record) => record.slug)).toEqual([
      "test-substance",
    ]);
    expect(projection.allSubstancesBySlug.has("hidden-substance")).toBe(true);
    expect(projection.substanceBySlug.has("hidden-substance")).toBe(false);
  });

  it("projects taxonomy from normalized records without exposing accumulator assembly", () => {
    const psilocybinArticle = makeArticle({
      id: 8,
      title: "Psilocybin",
      identification: {
        ...createEmptyArticle().identification,
        common_name: "Psilocybin",
        alternative_names: ["Mushroom compound", "Mushroom compound"],
      },
      classification: {
        psychoactive_class: ["Psychedelic"],
        chemical_class: [],
      },
      pharmacology: {
        ...createEmptyArticle().pharmacology,
        binding_sites: [
          { target: "5-HT2A", tag: "5-HT2A receptor agonist" },
        ],
      },
    });
    const { substanceRecords } = projectArticleNormalization([
      fullArticleWithDosage,
      psilocybinArticle,
    ]);

    const taxonomy = projectTaxonomy(substanceRecords);

    expect(taxonomy.getChemicalClassDetail("lysergamide")?.drugs).toEqual([
      expect.objectContaining({ slug: "lsd" }),
    ]);
    expect(taxonomy.getPsychoactiveClassDetail("psychedelic")?.total).toBe(2);
    expect(taxonomy.mechanismSummaries).toEqual([
      { name: "5-HT2A receptor agonist", slug: "5-ht2a-receptor-agonist", total: 2 },
    ]);
    expect(taxonomy.autoChemicalClassIndexGroups.some((group) => group.key === "unspecified")).toBe(true);
  });

  it("projects mechanism taxonomy from typed mechanisms instead of presentation labels", () => {
    const article = makeArticle({
      id: 18,
      title: "Label Independent Mechanism",
      pharmacology: {
        ...createEmptyArticle().pharmacology,
        binding_sites: [
          { target: "GABA-A", tag: "GABA-A receptor modulator (positive allosteric modulator)" },
        ],
      },
    });
    const { substanceRecords } = projectArticleNormalization([article]);
    const record = substanceRecords[0];
    if (!record) {
      throw new Error("Expected article normalization to create a record.");
    }

    record.content.infoSections = record.content.infoSections.map((section) => ({
      ...section,
      items: section.items.map((item) =>
        item.label === "Mechanism of Action"
          ? { ...item, label: "Pharmacodynamic profile", value: "Presentation copy changed" }
          : item,
      ),
    }));

    const taxonomy = projectTaxonomy(substanceRecords);

    expect(record.mechanisms).toEqual([
      {
        label: "GABA-A receptor modulator (positive allosteric modulator)",
        base: "GABA-A receptor modulator",
        slug: "gaba-a-receptor-modulator",
        qualifier: "positive allosteric modulator",
        qualifierSlug: "positive-allosteric-modulator",
      },
    ]);
    expect(taxonomy.mechanismSummaries).toEqual([
      { name: "GABA-A receptor modulator", slug: "gaba-a-receptor-modulator", total: 1 },
    ]);
  });

  it("projects manual index groups and fallback detail groups from normalized records", () => {
    const fallbackArticle = makeArticle({
      id: 9,
      title: "Unlisted Substance",
      classification: {
        psychoactive_class: [],
        chemical_class: [],
      },
    });
    const normalization = projectArticleNormalization([fullArticleWithDosage, fallbackArticle]);
    const taxonomy = projectTaxonomy(normalization.substanceRecords);

    const manual = projectManualIndexes({
      substanceBySlug: normalization.substanceBySlug,
      configs,
      autoChemicalClassIndexGroups: taxonomy.autoChemicalClassIndexGroups,
      autoMechanismIndexGroups: taxonomy.autoMechanismIndexGroups,
    });

    expect(manual.getCategoryDetail("Psychedelics")?.groups[0]?.drugs).toEqual([
      expect.objectContaining({ slug: "lsd" }),
    ]);
    expect(manual.buildCategoryGroupsForRecords(normalization.substanceRecords)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "miscellaneous",
          drugs: [expect.objectContaining({ slug: "unlisted-substance" })],
        }),
      ]),
    );
    expect(manual.chemicalClassIndexGroups.some((group) => group.key === "lysergamide")).toBe(true);
  });

  it("creates a public facade with stable library read methods", () => {
    const normalization = projectArticleNormalization([fullArticleWithDosage]);
    const taxonomy = projectTaxonomy(normalization.substanceRecords);
    const manual = projectManualIndexes({
      substanceBySlug: normalization.substanceBySlug,
      configs,
      autoChemicalClassIndexGroups: taxonomy.autoChemicalClassIndexGroups,
      autoMechanismIndexGroups: taxonomy.autoMechanismIndexGroups,
    });

    const library = createPublicLibraryFacade({
      articleProjection: normalization,
      taxonomyProjection: taxonomy,
      manualIndexProjection: manual,
      interactionIndex: buildInteractionIndex(normalization.substanceRecords),
    });

    expect(library.substanceBySlug.get("lsd")?.name).toBe("LSD");
    expect(library.getInteractionsForSubstance("lsd")?.[0]?.items[0]?.display).toBe("Lithium");
    expect(library.getEffectDetail("visual-effects")).toBeNull();
    expect(library.getMechanismSummary("5-ht2a-receptor-agonist")?.total).toBe(1);
    expect(library.getChemicalClassDetail("lysergamide")?.total).toBe(1);
    expect(library.getTaxonomyRouteDetail("chemical", "lysergamide")).toEqual(
      library.getChemicalClassDetail("lysergamide"),
    );
    expect(library.getTaxonomyRouteDetail("psychoactive", "psychedelic")).toEqual(
      library.getPsychoactiveClassDetail("psychedelic"),
    );
    expect(library.getTaxonomyRouteDetail("mechanism", "5-ht2a-receptor-agonist")).toEqual(
      library.getMechanismDetail("5-ht2a-receptor-agonist"),
    );
    expect(library.getTaxonomyRouteDetail("category", "psychedelics")).toEqual(
      library.getCategoryDetail("psychedelics"),
    );
    expect(library.getTaxonomyRoutePath("chemical", "lysergamide")).toBe("/chemical/lysergamide");
  });
});
