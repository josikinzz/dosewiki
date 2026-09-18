import { describe, expect, it, vi } from "vitest";
import {
  projectLibraryInput,
  projectMechanismRouteInput,
} from "../../src/data/projections/substanceReadProjections";
import {
  parsePublicSubstanceLibraryInputRecords,
  parsePublicSubstanceRecords,
} from "../data/publicData.substanceContract";
import { buildLibrary } from "../../src/data/builders/libraryBuilder";
import { parseManualConfig } from "../../src/data/builders/manualIndexLoader";
import type { SubstanceArticle } from "../../src/schema";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import { buildPublicRoutePlan } from "./publicRoutePlan";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("next/cache", () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const createMechanismArticle = (
  id: number,
  title: string,
  mechanismTags: string[],
  overrides: Partial<SubstanceArticle> = {},
): SubstanceArticle => ({
  ...structuredClone(fullArticleWithDosage),
  id,
  title,
  priority: "normal",
  index_categories: [],
  identification: {
    ...structuredClone(fullArticleWithDosage.identification),
    common_name: title,
  },
  pharmacology: {
    ...structuredClone(fullArticleWithDosage.pharmacology),
    binding_sites: mechanismTags.map((tag) => ({
      target: tag,
      tag,
    })),
  },
  ...overrides,
});

const createEmptyConfig = () =>
  parseManualConfig({
    version: 1,
    categories: [
      {
        key: "miscellaneous",
        label: "Miscellaneous",
        iconKey: "miscellaneous",
        drugs: [],
        sections: [],
      },
    ],
  });

describe("mechanism route projection parity", () => {
  it("matches the real library's ordered mechanism and qualifier route entries", () => {
    const articles = [
      createMechanismArticle(1, "Zeta example", [
        "Zeta receptor (beta)",
        "Zeta receptor",
      ]),
      createMechanismArticle(2, "Alpha example", [
        "Alpha target (partial agonist)",
        "Alpha target (full agonist)",
      ]),
      createMechanismArticle(3, "Hidden example", ["Hidden target"], {
        index_categories: ["Hidden!"],
      }),
      createMechanismArticle(4, "Low example", ["Low target"], {
        priority: "low",
      }),
      createMechanismArticle(5, "Obscure example", ["Obscure target"], {
        index_categories: ["Obscure!"],
      }),
      createMechanismArticle(6, "", ["Nameless target"], {
        identification: {
          ...structuredClone(fullArticleWithDosage.identification),
          common_name: "",
          substitutive_name: "",
          iupac_name: "",
        },
      }),
    ];
    const emptyConfig = createEmptyConfig();
    const library = buildLibrary(articles, {
      psychoactive: emptyConfig,
      chemical: emptyConfig,
      mechanism: emptyConfig,
    });

    const libraryMechanisms = library.mechanismSummaries.map(
      ({ slug: mechanismSlug }) => ({
        path: `/mechanism/${mechanismSlug}`,
        params: { mechanismSlug },
        includeInSitemap: undefined,
      }),
    );
    const libraryQualifiers = library.mechanismSummaries.flatMap(
      ({ slug: mechanismSlug }) => {
        const detail = library.getMechanismDetail(mechanismSlug);
        return (detail?.qualifiers ?? []).map(({ key: qualifierSlug }) => ({
          path: `/mechanism/${mechanismSlug}/${qualifierSlug}`,
          params: { mechanismSlug, qualifierSlug },
          includeInSitemap:
            qualifierSlug !== detail?.defaultQualifierKey,
        }));
      },
    );

    const projectedPlan = buildPublicRoutePlan({
      substances: [],
      categories: [],
      effects: [],
      replications: [],
      galleryReplications: [],
      articles: [],
      reports: [],
      contributorDirectory: [],
      mechanismRouteInput: articles.map(projectMechanismRouteInput),
    });
    const projectedMechanisms = projectedPlan.families.mechanisms.map(
      (entry) => ({
        ...entry,
        includeInSitemap: entry.includeInSitemap,
      }),
    );

    expect(projectedMechanisms).toEqual(libraryMechanisms);
    expect(projectedPlan.families.mechanismQualifiers).toEqual(
      libraryQualifiers,
    );
  });

  it("canonicalizes legacy-only pharmacology consistently across library and route paths", () => {
    const {
      binding_sites: _canonicalBindingSites,
      ...legacyOnlyPharmacology
    } = structuredClone(fullArticleWithDosage.pharmacology);
    const legacyOnlyArticle = {
      ...createMechanismArticle(7, "Legacy-only example", []),
      slug: "legacy-only-example",
      pharmacology: {
        ...legacyOnlyPharmacology,
        mechanism_of_action: ["Dopamine releaser"],
        receptor_binding: { DAT: "releasing agent" },
        metabolism: "Hepatic metabolism.",
      },
    } as unknown as SubstanceArticle & {
      slug: string;
      pharmacology: SubstanceArticle["pharmacology"] & {
        mechanism_of_action: string[];
        receptor_binding: Record<string, string>;
        metabolism: string;
      };
    };
    const configs = {
      psychoactive: createEmptyConfig(),
      chemical: createEmptyConfig(),
      mechanism: createEmptyConfig(),
    };
    const fullArticles = parsePublicSubstanceRecords([legacyOnlyArticle]);
    const slimArticles = parsePublicSubstanceLibraryInputRecords([
      projectLibraryInput(legacyOnlyArticle),
    ]);
    const fullMechanisms = buildLibrary(
      fullArticles,
      configs,
    ).mechanismSummaries;
    const slimMechanisms = buildLibrary(
      slimArticles,
      configs,
    ).mechanismSummaries;
    const routePlan = buildPublicRoutePlan({
      substances: [],
      categories: [],
      effects: [],
      replications: [],
      galleryReplications: [],
      articles: [],
      reports: [],
      contributorDirectory: [],
      mechanismRouteInput: [projectMechanismRouteInput(legacyOnlyArticle)],
    });

    expect(fullArticles[0]?.pharmacology).not.toHaveProperty(
      "mechanism_of_action",
    );
    expect(fullArticles[0]?.pharmacology.binding_sites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: "Dopamine releaser" }),
      ]),
    );
    expect(slimMechanisms).toEqual(fullMechanisms);
    expect(routePlan.families.mechanisms).toEqual(
      fullMechanisms.map(({ slug: mechanismSlug }) => ({
        path: `/mechanism/${mechanismSlug}`,
        params: { mechanismSlug },
      })),
    );
    expect(fullMechanisms).toEqual([
      { name: "Dopamine releaser", slug: "dopamine-releaser", total: 1 },
    ]);
  });

  it("re-normalizes stale mechanism projections before building public routes", () => {
    const staleProjection = {
      ...projectMechanismRouteInput(
        createMechanismArticle(8, "Citation example", ["5-HT2A receptor agonist"]),
      ),
      mechanisms: [
        {
          label:
            "5-HT2A receptor agonist (partial)[cite:doi-10-1000-example]",
          base:
            "5-HT2A receptor agonist (partial)[cite:doi-10-1000-example]",
          slug:
            "5-ht2a-receptor-agonist-partial-cite-doi-10-1000-example",
        },
      ],
    };

    const plan = buildPublicRoutePlan({
      substances: [],
      categories: [],
      effects: [],
      replications: [],
      galleryReplications: [],
      articles: [],
      reports: [],
      contributorDirectory: [],
      mechanismRouteInput: [staleProjection],
    });

    expect(plan.families.mechanisms).toEqual([
      {
        path: "/mechanism/5-ht2a-receptor-agonist",
        params: { mechanismSlug: "5-ht2a-receptor-agonist" },
      },
    ]);
    expect(plan.families.mechanismQualifiers).toEqual([
      {
        path: "/mechanism/5-ht2a-receptor-agonist/partial",
        params: {
          mechanismSlug: "5-ht2a-receptor-agonist",
          qualifierSlug: "partial",
        },
        includeInSitemap: false,
      },
    ]);
  });
});
