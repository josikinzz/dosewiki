import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { Translate } from "@/i18n/messages";
import { translateMessage } from "@/i18n/serverMessages";
import type { SubstanceArticle } from "@/schema";
import type { ArticleStubVerdict } from "@/schema/substance/articleStubPolicy";
import { ALWAYS_RENDERED_PUBLIC_SECTION_IDS } from "@/schema/substance/sectionManifest";
import {
  ARTICLE_GAP_ORDER,
  ARTICLE_GAP_POLICIES,
  SUBSECTION_GAP_POLICIES,
  buildArticleGapCopy,
  buildArticleStubCopy,
  buildSubsectionGapCopy,
  resolveGap,
  resolveSubsectionGapReason,
} from "./articleGapCopy";
import { getEmptyArticleSectionKeys } from "./articleGapPresence";

const NEIGHBOURS = [
  { slug: "2c-b", name: "2C-B" },
  { slug: "2c-i", name: "2C-I" },
];

const t: Translate = (text, values) => translateMessage("en", text, values);

function articleWithGaps(section_gaps: SubstanceArticle["section_gaps"]): SubstanceArticle {
  return { ...createEmptyArticle(), section_gaps };
}

describe("article gap copy", () => {
  it("agrees the verb with the topic for hedged sections", () => {
    const gap = { reason: "sources-silent" as const, family: "2C-x phenethylamines", neighbours: NEIGHBOURS };

    expect(buildArticleGapCopy(t, ARTICLE_GAP_POLICIES.subjective_effects, gap).lead).toBe(
      "Subjective effects are likely somewhat similar to other 2C-x phenethylamines:",
    );
    expect(buildArticleGapCopy(t, ARTICLE_GAP_POLICIES.tolerance, gap).lead).toBe(
      "Tolerance is likely somewhat similar to other 2C-x phenethylamines:",
    );
  });

  it("never phrases the neighbour list as an inference for pointer-only sections", () => {
    const gap = { reason: "sources-silent" as const, family: "2C-x phenethylamines", neighbours: NEIGHBOURS };

    for (const key of ["dosage_duration", "harm_potential", "legality"] as const) {
      const copy = buildArticleGapCopy(t, ARTICLE_GAP_POLICIES[key], gap);
      expect(copy.lead).toBe("Better documented nearby:");
      expect(copy.lead).not.toMatch(/likely|similar/);
      // Each carries the caution that stops the list reading as advice.
      expect(copy.caution).toBeTruthy();
    }

    expect(buildArticleGapCopy(t, ARTICLE_GAP_POLICIES.harm_potential, gap).caution).toBe(
      "An absence of harm data is not evidence of safety.",
    );
  });

  it("omits the neighbour line entirely where there is nothing to infer", () => {
    const gap = { reason: "sources-silent" as const, family: "2C-x phenethylamines", neighbours: NEIGHBOURS };
    expect(buildArticleGapCopy(t, ARTICLE_GAP_POLICIES.history_culture, gap).lead).toBe("");
  });

  it("drops the lead and the caution when there are no neighbours", () => {
    const gap = { reason: "sources-silent" as const, family: null, neighbours: [] };
    const copy = buildArticleGapCopy(t, ARTICLE_GAP_POLICIES.legality, gap);
    expect(copy.lead).toBe("");
    expect(copy.caution).toBeUndefined();
    expect(copy.title).toBe("No published legal status data");
  });

  it("titles an unworked section differently from an evidenced absence", () => {
    const base = { family: null, neighbours: [] };
    expect(
      buildArticleGapCopy(t, ARTICLE_GAP_POLICIES.tolerance, { ...base, reason: "sources-silent" }).title,
    ).toBe("No published tolerance data");
    expect(
      buildArticleGapCopy(t, ARTICLE_GAP_POLICIES.tolerance, { ...base, reason: "not-written" }).title,
    ).toBe("Tolerance not written up yet");
  });
});

describe("resolveGap", () => {
  it("defaults to not-written rather than claiming sources were checked", () => {
    expect(resolveGap(createEmptyArticle(), ARTICLE_GAP_POLICIES.tolerance).reason).toBe(
      "not-written",
    );
  });

  it("prefers a per-section override over the article default", () => {
    const article = articleWithGaps({
      family: "2C-x phenethylamines",
      reason: "not-written",
      neighbours: NEIGHBOURS,
      sections: {
        tolerance: { reason: "sources-silent", neighbours: [{ slug: "2c-e", name: "2C-E" }] },
      },
    });

    const tolerance = resolveGap(article, ARTICLE_GAP_POLICIES.tolerance);
    expect(tolerance.reason).toBe("sources-silent");
    expect(tolerance.neighbours).toEqual([{ slug: "2c-e", name: "2C-E" }]);

    const legality = resolveGap(article, ARTICLE_GAP_POLICIES.legality);
    expect(legality.reason).toBe("not-written");
    expect(legality.neighbours).toEqual(NEIGHBOURS);
  });
});

describe("subsection gap copy", () => {
  it("never calls a single missing fact a stub", () => {
    for (const policy of Object.values(SUBSECTION_GAP_POLICIES)) {
      for (const reason of ["not-written", "sources-silent"] as const) {
        const copy = buildSubsectionGapCopy(t, policy, reason);
        expect(`${copy.label} ${copy.status}`).not.toMatch(/stub/i);
      }
    }
  });

  it("names the slot rather than repeating the subsection heading above it", () => {
    expect(buildSubsectionGapCopy(t, SUBSECTION_GAP_POLICIES.pharmacokinetics, "not-written").label)
      .not.toMatch(/pharmacokinetics/i);
  });

  it("separates an unworked slot from an evidenced absence", () => {
    expect(buildSubsectionGapCopy(t, SUBSECTION_GAP_POLICIES.metabolites, "not-written").status).toBe(
      "none documented yet",
    );
    expect(
      buildSubsectionGapCopy(t, SUBSECTION_GAP_POLICIES.metabolites, "sources-silent").status,
    ).toBe("none reported in the literature");
  });
});

describe("resolveSubsectionGapReason", () => {
  const { metabolites } = SUBSECTION_GAP_POLICIES;

  it("defaults to not-written rather than claiming sources were checked", () => {
    expect(resolveSubsectionGapReason(createEmptyArticle(), metabolites, "pharmacology")).toBe(
      "not-written",
    );
  });

  it("inherits the parent section's reason without needing a per-slot entry", () => {
    const article = articleWithGaps({
      neighbours: [],
      sections: { pharmacology: { reason: "sources-silent" } },
    });

    expect(resolveSubsectionGapReason(article, metabolites, "pharmacology")).toBe(
      "sources-silent",
    );
  });

  it("prefers the slot's own reason over the section and the article defaults", () => {
    const article = articleWithGaps({
      reason: "sources-silent",
      neighbours: [],
      sections: {
        pharmacology: { reason: "sources-silent" },
        "pharmacology.metabolites": { reason: "not-written" },
      },
    });

    expect(resolveSubsectionGapReason(article, metabolites, "pharmacology")).toBe("not-written");
  });
});

describe("buildArticleStubCopy", () => {
  const CLOSER = "Everything shown is sourced; the gaps are real gaps, not omissions.";

  function verdict(
    reasons: ArticleStubVerdict["reasons"],
    emptyCount: number,
  ): ArticleStubVerdict {
    return {
      isStub: reasons.length > 0,
      reasons,
      emptySectionIds: ALWAYS_RENDERED_PUBLIC_SECTION_IDS.slice(0, emptyCount),
    };
  }

  it("counts the empty sections when the count is what qualified the article", () => {
    expect(buildArticleStubCopy(t, verdict(["missing-sections"], 3), 7)).toBe(
      `Three of its seven sections have no published data. ${CLOSER}`,
    );
  });

  it("names the missing dosage data instead of a count that did not trigger it", () => {
    const copy = buildArticleStubCopy(t, verdict(["no-dosage"], 2), 7);

    expect(copy).toBe(`No dosage or duration data has been published for it. ${CLOSER}`);
    // The two empty sections are real, but two of seven is not why it is a stub.
    expect(copy).not.toMatch(/Two of its/);
  });

  it("states both reasons when both qualify", () => {
    expect(buildArticleStubCopy(t, verdict(["missing-sections", "no-dosage"], 7), 7)).toBe(
      `No dosage or duration data has been published for it. Seven of its seven sections have no published data. ${CLOSER}`,
    );
  });
});

describe("getEmptyArticleSectionKeys", () => {
  it("uses the same seven sections as the stub policy, in the same order", () => {
    expect(ARTICLE_GAP_ORDER.map((key) => ARTICLE_GAP_POLICIES[key].id)).toEqual([
      ...ALWAYS_RENDERED_PUBLIC_SECTION_IDS,
    ]);
  });

  it("reports every editorial section on an article with no content", () => {
    expect(getEmptyArticleSectionKeys(createEmptyArticle())).toEqual(ARTICLE_GAP_ORDER);
  });

  it("drops a section once it has content", () => {
    const article: SubstanceArticle = {
      ...createEmptyArticle(),
      tolerance: {
        full_tolerance: "Tolerance builds rapidly.",
        half_tolerance: "",
        baseline_tolerance: "",
        cross_tolerance: [],
      },
    };
    expect(getEmptyArticleSectionKeys(article)).not.toContain("tolerance");
  });
});
