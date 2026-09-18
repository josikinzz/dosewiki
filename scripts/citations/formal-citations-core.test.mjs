import { describe, expect, it } from "vitest";

import { FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION } from "./formal-citations-contract.mjs";
import { buildFormalCitationDraftFromAgent } from "./formal-citations-core.mjs";
import { collectFormalCitationReferences } from "./formal-citations-reference-catalog.mjs";
import { resolveFormalCitationSections } from "./formal-citations-section-config.mjs";
import { buildFormalCitationTargets } from "./formal-citations-targets.mjs";

function createArticle(overrides = {}) {
  return {
    id: "article-1",
    slug: "2c-b",
    title: "2C-B",
    summary: "2C-B is a psychedelic phenethylamine.",
    references: [],
    source_citations: [
      { name: "Erowid", url: "https://erowid.org/chemicals/2cb/" },
    ],
    pharmacology: {
      pharmacodynamics: "2C-B is a psychedelic phenethylamine.",
      pharmacokinetics: "",
    },
    harm_potential: { summary: "" },
    history_culture: { content: "" },
    legality: {
      countries: {
        us: { notes: "2C-B is controlled in the United States." },
      },
    },
    tolerance: {
      full_tolerance: "",
      half_tolerance: "",
      baseline_tolerance: "",
      cross_tolerance: [],
    },
    dosage: {
      routes: [{ route: "oral", dose_ranges: {}, notes: "" }],
    },
    duration: {
      routes: [{ route: "oral", stages: {} }],
    },
    ...overrides,
  };
}

function makeValidatedSectionResult({ article, sectionKey, referenceId, claims }) {
  const targets = buildFormalCitationTargets({ article, sectionKey });
  return {
    schemaVersion: FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION,
    sectionKey,
    summary: "",
    notes: [],
    diagnostics: [],
    validationSummary: {
      targetCount: targets.length,
      emittedClaimCount: claims.length,
      diagnosticCount: 0,
      downgradedClaimCount: 0,
    },
    sourcePacket: {
      allowedReferences: [
        {
          id: referenceId,
          type: "webpage",
          title: "Erowid 2C-B Vault",
          siteName: "Erowid",
          url: "https://erowid.org/chemicals/2cb/",
          sourceType: "experience_archive",
          quality: "low",
          sourceIds: ["erowid"],
        },
      ],
    },
    claims,
  };
}

describe("formal citations core workflow behavior", () => {
  it("discovers requested sections and representative targets without touching content", () => {
    const article = createArticle({
      tolerance: {
        full_tolerance: "Tolerance develops rapidly.",
        half_tolerance: "",
        baseline_tolerance: "",
        cross_tolerance: [],
      },
    });

    expect(resolveFormalCitationSections({ article })).toEqual([
      "summary",
      "pharmacology",
      "harm_potential",
      "legality",
      "history_culture",
      "tolerance",
    ]);
    expect(() => resolveFormalCitationSections({
      article,
      requestedSection: "dosage-duration",
    })).toThrow(/unknown formal citation section/i);
    expect(resolveFormalCitationSections({
      article,
      requestedSections: ["legality", "summary"],
    })).toEqual(["legality", "summary"]);

    expect(buildFormalCitationTargets({ article, sectionKey: "summary" })).toEqual([
      expect.objectContaining({
        claimKey: "summary:summary",
        mergeMode: "inline_text",
        fieldPath: "summary",
      }),
    ]);
    expect(buildFormalCitationTargets({ article, sectionKey: "legality" })).toEqual([
      expect.objectContaining({
        claimKey: "legality:legality.countries.us.notes",
        mergeMode: "inline_text",
      }),
    ]);
  });

  it("canonicalizes legacy and recovered references before applying agent evidence", () => {
    const article = createArticle();
    const legacyReference = collectFormalCitationReferences(article)[0];

    const draft = buildFormalCitationDraftFromAgent({
      article,
      sectionResults: [
        makeValidatedSectionResult({
          article,
          sectionKey: "pharmacology",
          referenceId: legacyReference.id,
          claims: [
            {
              claimKey: "pharmacology:pharmacology.pharmacodynamics",
              fieldPath: "pharmacology.pharmacodynamics",
              claimText: "2C-B is a psychedelic phenethylamine.",
              status: "supported",
              originalStatus: "supported",
              statusReason: "",
              referenceIds: [legacyReference.id],
              supports: [
                {
                  sourceId: "erowid",
                  sourceName: "Erowid",
                  referenceId: legacyReference.id,
                  sourceType: "experience_archive",
                  quality: "low",
                  supportingQuote: "2C-B is a psychedelic phenethylamine",
                  rationale: "The source supports the statement.",
                  verifiedQuote: {
                    sourceId: "erowid",
                    matchType: "exact",
                    startOffset: 0,
                    endOffset: 34,
                  },
                },
              ],
              diagnostics: [],
            },
          ],
        }),
      ],
    });

    expect(draft.references).toHaveLength(1);
    expect(draft.references[0].id).toBe(legacyReference.id);
    expect(draft.article.pharmacology.pharmacodynamics).toContain(`[cite:${legacyReference.id}]`);
    expect(draft.evidence).toEqual([
      expect.objectContaining({
        claimKey: "pharmacology:pharmacology.pharmacodynamics",
        status: "supported",
        referenceIds: [legacyReference.id],
        supports: [
          expect.objectContaining({
            referenceId: legacyReference.id,
            sourceId: "erowid",
          }),
        ],
      }),
    ]);
  });
});
