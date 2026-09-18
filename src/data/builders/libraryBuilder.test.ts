import { describe, expect, it } from "vitest";
import { projectLibraryInput } from "../projections/substanceReadProjections";
import {
  parsePublicSubstanceLibraryInputRecords,
  parsePublicSubstanceRecords,
} from "../../../lib/data/publicData.substanceContract";
import type { SubstanceArticle } from "@/schema";
import type { LibraryData } from "../SubstanceIndexProvider";
import { buildLibrary } from "./libraryBuilder";
import { parseManualConfig } from "./manualIndexLoader";
import { fullArticleWithDosage, minimalArticle } from "@/test/fixtures/articles";
import { createSearchIndexInput } from "./search";

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

  it("builds equivalent library and search surfaces from full and slim articles", () => {
    const lsd = {
      ...structuredClone(fullArticleWithDosage),
      slug: "lsd",
      summary: "A full fixture summary used by search.",
      subjective_effects: {
        ...structuredClone(fullArticleWithDosage.subjective_effects),
        cognitive: {
          perception: {
            note: "",
            effects: [
              {
                name: "Visual drifting (peripheral)",
                description: "Fixture effect.",
              },
            ],
          },
        },
      },
      pharmacology: {
        ...structuredClone(fullArticleWithDosage.pharmacology),
        pharmacodynamics: "Serotonergic agonism.",
        pharmacokinetics: "Hepatic metabolism.",
        metabolites: ["nor-LSD"],
        protein_binding: "High",
        volume_of_distribution: "Fixture volume",
        route_bioavailability: { sublingual: "71%" },
        route_half_life: { sublingual: "3.6 hours" },
        route_half_life_notes: { sublingual: "Fixture note" },
        route_bioavailability_notes: { sublingual: "Fixture note" },
        bioavailability_notes: "Route dependent.",
        half_life: "3.6 hours",
      },
      harm_potential: {
        ...structuredClone(fullArticleWithDosage.harm_potential),
        addiction_liability: "Low addiction liability.",
        unused_transport_detail: "This must not be required by the library.",
      },
      references: [
        {
          id: "lsd-doi",
          type: "journal_article",
          title: "LSD fixture source",
          authors: ["Example Author"],
          doi: "10.1000/lsd",
          sourceType: "primary_literature",
          quality: "high",
        },
        {
          id: "metadata-only",
          type: "book",
          title: "Metadata-only fixture source",
          authors: ["Example Author"],
          sourceType: "book",
          quality: "medium",
        },
      ],
      source_citations: [
        { name: "DOI source", url: "https://doi.org/10.1000/lsd" },
        { name: "Unique source", url: "https://example.test/unique" },
      ],
      editorial_review: {
        status: "completed" as const,
        notes: "Not public.",
      },
    } satisfies SubstanceArticle & { slug: string };
    const {
      binding_sites: _canonicalBindingSites,
      ...legacyOnlyPharmacology
    } = structuredClone(minimalArticle.pharmacology);
    const psilocybin = {
      ...structuredClone(minimalArticle),
      id: 2,
      title: "Psilocybin",
      slug: "psilocybin",
      summary: "A legacy pharmacology fixture.",
      identification: {
        ...structuredClone(minimalArticle.identification),
        common_name: "Psilocybin",
        alternative_names: ["4-PO-DMT"],
      },
      classification: {
        psychoactive_class: ["Psychedelic"],
        chemical_class: ["Tryptamine"],
      },
      subjective_effects: {
        ...structuredClone(minimalArticle.subjective_effects),
        sensory: {
          ...structuredClone(minimalArticle.subjective_effects.sensory),
          visual: {
            note: "",
            subcategories: {
              motion: {
                note: "",
                effects: [
                  { name: "Visual drifting", description: "Fixture effect." },
                ],
              },
            },
          },
        },
      },
      pharmacology: {
        ...legacyOnlyPharmacology,
        mechanism_of_action: ["5-HT2A receptor agonist"],
        receptor_binding: { "5-HT1A": "partial agonist" },
        metabolism: "Hepatic dephosphorylation.",
        pharmacokinetics: "",
        half_life: "2.5 hours",
      },
    } as unknown as SubstanceArticle & {
      slug: string;
      pharmacology: SubstanceArticle["pharmacology"] & {
        mechanism_of_action: string[];
        receptor_binding: Record<string, string>;
        metabolism: string;
      };
    };
    const rawArticles = [lsd, psilocybin];
    const fullArticles = parsePublicSubstanceRecords(rawArticles);
    expect(fullArticles).toHaveLength(rawArticles.length);
    const slimArticles = parsePublicSubstanceLibraryInputRecords(
      rawArticles.map(projectLibraryInput),
    );
    expect(slimArticles).toHaveLength(rawArticles.length);

    const categoryConfig = parseManualConfig({
      version: 1,
      categories: [
        {
          key: "psychedelics",
          label: "Psychedelics",
          iconKey: "sparkles",
          drugs: ["lsd"],
          sections: [
            {
              key: "tryptamines",
              label: "Tryptamines",
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
    const configs = {
      psychoactive: categoryConfig,
      chemical: emptyConfig,
      mechanism: emptyConfig,
    };
    const fullLibrary = buildLibrary(fullArticles, configs);
    const slimLibrary = buildLibrary(slimArticles, configs);
    const routeSurfaces = [
      ["category", "psychedelics"],
      ["chemical", "lysergamide"],
      ["psychoactive", "psychedelic"],
      ["mechanism", "5-ht2a-receptor-agonist"],
      ["effect", "visual-drifting"],
    ] as const;
    const comparableOutput = (library: LibraryData) => ({
      allSubstanceRecords: library.allSubstanceRecords,
      substanceRecords: library.substanceRecords,
      allSubstancesBySlug: Array.from(library.allSubstancesBySlug.entries()),
      substanceBySlug: Array.from(library.substanceBySlug.entries()),
      interactionIndex: Array.from(library.interactionIndex.entries()),
      dosageCategoryGroups: library.dosageCategoryGroups,
      chemicalClassIndexGroups: library.chemicalClassIndexGroups,
      mechanismIndexGroups: library.mechanismIndexGroups,
      effectSummaries: library.effectSummaries,
      mechanismSummaries: library.mechanismSummaries,
      routeSurfaces: routeSurfaces.map(([surface, identifier]) => ({
        surface,
        identifier,
        detail: library.getTaxonomyRouteDetail(surface, identifier),
        path: library.getTaxonomyRoutePath(surface, identifier),
      })),
      searchIndexInput: createSearchIndexInput(library),
    });

    expect(comparableOutput(slimLibrary)).toEqual(
      comparableOutput(fullLibrary),
    );
  });
});
