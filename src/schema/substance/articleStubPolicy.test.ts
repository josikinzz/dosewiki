import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { SubstanceArticle } from "@/schema";
import {
  getArticleStubVerdict,
  getEmptyStubSectionIds,
  isArticleStub,
  STUB_THRESHOLD,
} from "./articleStubPolicy";
import { ALWAYS_RENDERED_PUBLIC_SECTION_IDS } from "./sectionManifest";

const EMPTY_TIER = { min: null, max: null, unit: "mg" };

/** A route with numbers in it — what a published dose ladder looks like. */
const DOSAGE_WITH_NUMBERS: SubstanceArticle["dosage"] = {
  routes: [
    {
      route: "Oral",
      bioavailability: "",
      bioavailability_notes: "",
      dose_ranges: {
        threshold: { min: 5, max: null, unit: "mg" },
        light: { min: 5, max: 10, unit: "mg" },
        moderate: { min: 10, max: 20, unit: "mg" },
        strong: { min: 20, max: 30, unit: "mg" },
        heavy: { min: 30, max: null, unit: "mg" },
      },
      notes: "",
      reference_ids: [],
    },
  ],
  plateau_dosing: null,
};

/**
 * The scaffold a generator writes when a source merely names a route: every
 * tier present, every bound null, no prose. It renders as an empty table.
 */
const HOLLOW_DOSAGE_SCAFFOLD: SubstanceArticle["dosage"] = {
  routes: [
    {
      route: "Oral",
      bioavailability: "",
      bioavailability_notes: "",
      dose_ranges: {
        threshold: EMPTY_TIER,
        light: EMPTY_TIER,
        moderate: EMPTY_TIER,
        strong: EMPTY_TIER,
        heavy: EMPTY_TIER,
      },
      notes: "",
      reference_ids: [],
    },
  ],
  plateau_dosing: null,
};

function withSubjectiveEffects(article: SubstanceArticle): SubstanceArticle {
  return {
    ...article,
    subjective_effects: {
      ...article.subjective_effects,
      notes: { ...article.subjective_effects.notes, overview: "Reported as strongly visual." },
    },
  };
}

function withPharmacology(article: SubstanceArticle): SubstanceArticle {
  return {
    ...article,
    pharmacology: { ...article.pharmacology, pharmacodynamics: "5-HT2A partial agonist." },
  };
}

function withInteractions(article: SubstanceArticle): SubstanceArticle {
  return {
    ...article,
    interactions: { ...article.interactions, dangerous: ["MAOIs (serotonin syndrome)"] },
  };
}

function withTolerance(article: SubstanceArticle): SubstanceArticle {
  return {
    ...article,
    tolerance: { ...article.tolerance, full_tolerance: "Tolerance builds rapidly." },
  };
}

function withHarmPotential(article: SubstanceArticle): SubstanceArticle {
  return {
    ...article,
    harm_potential: {
      ...article.harm_potential,
      psychosis: { level: null, description: "Isolated case reports." },
    },
  };
}

function withHistoryCulture(article: SubstanceArticle): SubstanceArticle {
  return {
    ...article,
    history_culture: { ...article.history_culture, content: "First synthesised in 1974." },
  };
}

function withLegality(article: SubstanceArticle): SubstanceArticle {
  return {
    ...article,
    legality: {
      ...article.legality,
      countries: { "United States": { status: "Schedule I", notes: "" } },
    },
  };
}

/** Every editorial section but Dosage & Duration carries content. */
function createArticleWithoutDosage(): SubstanceArticle {
  return [
    withSubjectiveEffects,
    withPharmacology,
    withInteractions,
    withTolerance,
    withHarmPotential,
    withHistoryCulture,
    withLegality,
  ].reduce((article, populate) => populate(article), createEmptyArticle());
}

function createFullyPopulatedArticle(): SubstanceArticle {
  return { ...createArticleWithoutDosage(), dosage: DOSAGE_WITH_NUMBERS };
}

describe("getEmptyStubSectionIds", () => {
  it("reports every editorial section on an article with no content", () => {
    expect(getEmptyStubSectionIds(createEmptyArticle())).toEqual([
      ...ALWAYS_RENDERED_PUBLIC_SECTION_IDS,
    ]);
  });

  it("reports nothing on a fully populated article", () => {
    expect(getEmptyStubSectionIds(createFullyPopulatedArticle())).toEqual([]);
  });
});

describe("getArticleStubVerdict", () => {
  it("flags an article with no dosage data even when nothing else is missing", () => {
    const verdict = getArticleStubVerdict(createArticleWithoutDosage());

    expect(verdict.isStub).toBe(true);
    expect(verdict.reasons).toEqual(["no-dosage"]);
    // Below the section-count threshold, so the count alone would have suppressed it.
    expect(verdict.emptySectionIds).toEqual(["dosage-duration"]);
    expect(verdict.emptySectionIds.length).toBeLessThan(STUB_THRESHOLD);
  });

  it("treats a hollow dosage scaffold as no dosage data", () => {
    const article: SubstanceArticle = {
      ...createArticleWithoutDosage(),
      dosage: HOLLOW_DOSAGE_SCAFFOLD,
    };

    const verdict = getArticleStubVerdict(article);
    expect(verdict.reasons).toContain("no-dosage");
    expect(verdict.emptySectionIds).toContain("dosage-duration");
    expect(isArticleStub(article)).toBe(true);
  });

  it("flags an article at the empty-section threshold", () => {
    // Dosage published, three of the remaining sections left empty.
    const article = withSubjectiveEffects(
      withPharmacology(
        withInteractions(
          withTolerance({ ...createEmptyArticle(), dosage: DOSAGE_WITH_NUMBERS }),
        ),
      ),
    );

    const verdict = getArticleStubVerdict(article);
    expect(verdict.emptySectionIds).toEqual(["harm-potential", "history-culture", "legality"]);
    expect(verdict.emptySectionIds).toHaveLength(STUB_THRESHOLD);
    expect(verdict.reasons).toEqual(["missing-sections"]);
    expect(verdict.isStub).toBe(true);
  });

  it("does not flag an article one section short of the threshold", () => {
    const article = withSubjectiveEffects(
      withPharmacology(
        withInteractions(
          withTolerance(
            withHarmPotential({ ...createEmptyArticle(), dosage: DOSAGE_WITH_NUMBERS }),
          ),
        ),
      ),
    );

    const verdict = getArticleStubVerdict(article);
    expect(verdict.emptySectionIds).toHaveLength(STUB_THRESHOLD - 1);
    expect(verdict.isStub).toBe(false);
    expect(verdict.reasons).toEqual([]);
  });

  it("records both reasons when both qualify", () => {
    const verdict = getArticleStubVerdict(createEmptyArticle());

    expect(verdict.isStub).toBe(true);
    expect(verdict.reasons).toEqual(["missing-sections", "no-dosage"]);
    expect(verdict.emptySectionIds).toHaveLength(ALWAYS_RENDERED_PUBLIC_SECTION_IDS.length);
  });

  it("does not flag a fully populated article", () => {
    const article = createFullyPopulatedArticle();

    expect(getArticleStubVerdict(article)).toEqual({
      isStub: false,
      reasons: [],
      emptySectionIds: [],
    });
    expect(isArticleStub(article)).toBe(false);
  });
});
