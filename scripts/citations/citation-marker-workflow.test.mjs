import { describe, expect, it } from "vitest";

import {
  CITABLE_ARTICLE_SECTIONS,
  EXCLUDED_CITATION_SECTIONS,
  buildArticleWideCitationPacket,
  buildSectionCitationPacket,
  stripCitationMarkersFromValue,
  validateArticleMarkerCandidate,
  validateSectionMarkerCandidate,
} from "./citation-marker-workflow.mjs";
import {
  CITABLE_ARTICLE_SURFACE,
  EXCLUDED_CITATION_SURFACE,
} from "./formal-citations-section-config.mjs";

function createArticle() {
  return {
    slug: "2c-b",
    title: "2C-B",
    identification: { common_name: "2C-B" },
    classification: { psychoactive_class: ["psychedelic"], chemical_class: ["phenethylamine"] },
    summary: "2C-B is a psychedelic phenethylamine first synthesized in the 1970s.",
    dosage: { routes: [{ route: "oral", notes: "Excluded dosage text." }] },
    duration: { routes: [{ route: "oral", half_life: "Excluded duration text." }] },
    subjective_effects: { notes: { overview: "Excluded subjective effects text." } },
    comparisons: [{ drug: "mescaline", comparison: "Excluded comparison text." }],
    pharmacology: {
      pharmacodynamics: "2C-B acts primarily through serotonin receptor activity.",
      pharmacokinetics: "",
      binding_sites: [],
      metabolites: [],
    },
    interactions: { caution: ["Excluded interaction text."] },
    reagent_testing: { marquis: "Excluded reagent text." },
    tolerance: {
      full_tolerance: "Tolerance may develop with repeated use.",
      half_tolerance: "",
      baseline_tolerance: "",
      cross_tolerance: [],
    },
    harm_potential: {
      toxicity: {
        other: "Published human toxicity data for 2C-B remains limited.",
      },
    },
    history_culture: {
      content: "2C-B became associated with psychonaut and club cultures after its synthesis.",
      sections: [
        {
          heading: "Discovery",
          content: "Alexander Shulgin first synthesized 2C-B in 1974.",
          subsections: [],
        },
      ],
    },
    legality: {
      international: ["2C-B is internationally controlled under Schedule II."],
      countries: {
        "United States": {
          status: "Schedule I",
          notes: "2C-B is classified as a Schedule I controlled substance.",
        },
        Canada: {
          status: "Controlled",
          notes: "2C-B is controlled under federal law.",
        },
      },
    },
    references: [],
    source_citations: [],
    citations: [],
  };
}

const references = [
  { id: "shulgin1991", type: "book", title: "PiHKAL" },
  { id: "dea2cb", type: "report", title: "DEA 2C-B scheduling" },
  { id: "canada2cb", type: "webpage", title: "Canadian controlled substances" },
];

describe("citation marker workflow", () => {
  it("re-exports the canonical citable surface and packetizes whole top-level sections", () => {
    const article = createArticle();

    // The exact section lists are asserted once, in
    // formal-citations-section-config.test.mjs; this only checks the re-export
    // identity so importers of this module cannot drift from the canon.
    expect(CITABLE_ARTICLE_SECTIONS).toBe(CITABLE_ARTICLE_SURFACE);
    expect(EXCLUDED_CITATION_SECTIONS).toBe(EXCLUDED_CITATION_SURFACE);

    const legalityPacket = buildSectionCitationPacket({ article, sectionKey: "legality" });
    expect(legalityPacket).toEqual({
      kind: "section_citation_packet",
      sectionKey: "legality",
      article: { slug: "2c-b", title: "2C-B" },
      section: article.legality,
    });

    expect(() => buildSectionCitationPacket({ article, sectionKey: "dosage" }))
      .toThrow(/not in the citable article surface/i);
  });

  it("builds article-wide packets from accepted section output plus original citable sections only", () => {
    const article = createArticle();
    const acceptedSections = {
      legality: {
        ...article.legality,
        countries: {
          ...article.legality.countries,
          "United States": {
            ...article.legality.countries["United States"],
            notes: "2C-B is classified as a Schedule I controlled substance[cite:dea2cb].",
          },
        },
      },
    };

    const packet = buildArticleWideCitationPacket({
      article,
      acceptedSections,
      failedSectionKeys: ["harm_potential"],
      failedArtifacts: [
        {
          sectionKey: "harm_potential",
          candidate: {
            toxicity: {
              other: "Published human toxicity data for 2C-B remains sparse[cite:dea2cb].",
            },
          },
        },
      ],
    });

    expect(Object.keys(packet.sections)).toEqual(CITABLE_ARTICLE_SECTIONS);
    expect(packet.sections.legality).toEqual(acceptedSections.legality);
    expect(packet.sections.harm_potential).toEqual(article.harm_potential);
    expect(packet.sections).not.toHaveProperty("dosage");
    expect(JSON.stringify(packet)).not.toContain("sparse");
    expect(packet.failedSectionKeys).toEqual(["harm_potential"]);
    expect(packet.failedArtifactCount).toBe(1);
  });

  it("validates nested section candidates that only insert known citation markers", () => {
    const article = createArticle();
    const candidate = {
      ...article.legality,
      international: [
        "2C-B is internationally controlled[cite:dea2cb] under Schedule II.",
      ],
      countries: {
        "United States": {
          status: "Schedule I[cite:dea2cb]",
          notes: "2C-B is classified as a Schedule I controlled substance[cite:dea2cb][cite:shulgin1991].",
        },
        Canada: {
          status: "Controlled",
          notes: "2C-B is controlled under federal law.[cite:canada2cb]",
        },
      },
    };

    const validation = validateSectionMarkerCandidate({
      sectionKey: "legality",
      originalSection: article.legality,
      candidateSection: candidate,
      references,
    });

    expect(validation.ok).toBe(true);
    expect(validation.markers.map((marker) => marker.referenceId)).toEqual([
      "dea2cb",
      "dea2cb",
      "dea2cb",
      "shulgin1991",
      "canada2cb",
    ]);
    expect(stripCitationMarkersFromValue(candidate)).toEqual(article.legality);
  });

  it("ignores object key order while preserving pre-existing citation markers", () => {
    const originalSection = {
      sections: [
        {
          content: "Alexander Shulgin first synthesized 2C-B in 1974.[cite:old-ref]",
          heading: "Discovery",
          subsections: [],
        },
      ],
      content: "",
    };
    const candidateSection = {
      content: "",
      sections: [
        {
          heading: "Discovery",
          content: "Alexander Shulgin first synthesized 2C-B in 1974.[cite:old-ref][cite:shulgin1991]",
          subsections: [],
        },
      ],
    };

    const validation = validateSectionMarkerCandidate({
      sectionKey: "history_culture",
      originalSection,
      candidateSection,
      references: [...references, { id: "old-ref" }],
    });

    expect(validation.ok).toBe(true);
    expect(validation.markers).toEqual([
      expect.objectContaining({
        path: "history_culture.sections[0].content",
        referenceId: "old-ref",
      }),
      expect.objectContaining({
        path: "history_culture.sections[0].content",
        referenceId: "shulgin1991",
      }),
    ]);
    expect(validation.newMarkers).toEqual([
      expect.objectContaining({
        path: "history_culture.sections[0].content",
        referenceId: "shulgin1991",
      }),
    ]);
  });

  it("rejects non-marker text changes, malformed markers, unknown refs, and mid-word markers", () => {
    const article = createArticle();

    const rewritten = validateSectionMarkerCandidate({
      sectionKey: "harm_potential",
      originalSection: article.harm_potential,
      candidateSection: {
        toxicity: {
          other: "Published human toxicity data for 2C-B remains sparse[cite:dea2cb].",
        },
      },
      references,
    });
    expect(rewritten.ok).toBe(false);
    expect(rewritten.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "text_changed" }),
    ]));

    const malformed = validateSectionMarkerCandidate({
      sectionKey: "summary",
      originalSection: article.summary,
      candidateSection: "2C-B is a psychedelic phenethylamine[cite:] first synthesized in the 1970s.",
      references,
    });
    expect(malformed.ok).toBe(false);
    expect(malformed.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "malformed_marker" }),
    ]));

    const unknown = validateSectionMarkerCandidate({
      sectionKey: "summary",
      originalSection: article.summary,
      candidateSection: "2C-B is a psychedelic phenethylamine[cite:missing] first synthesized in the 1970s.",
      references,
    });
    expect(unknown.ok).toBe(false);
    expect(unknown.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unknown_reference" }),
    ]));

    const midWord = validateSectionMarkerCandidate({
      sectionKey: "summary",
      originalSection: article.summary,
      candidateSection: "2C-B is a psych[cite:shulgin1991]edelic phenethylamine first synthesized in the 1970s.",
      references,
    });
    expect(midWord.ok).toBe(false);
    expect(midWord.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "mid_word_marker" }),
    ]));
  });

  it("rejects article-wide candidates that put markers into excluded article fields", () => {
    const article = createArticle();
    const candidateArticle = {
      ...article,
      summary: "2C-B is a psychedelic phenethylamine[cite:shulgin1991] first synthesized in the 1970s.",
      dosage: {
        routes: [{ route: "oral", notes: "Excluded dosage text.[cite:shulgin1991]" }],
      },
    };

    const validation = validateArticleMarkerCandidate({
      originalArticle: article,
      candidateArticle,
      references,
    });

    expect(validation.ok).toBe(false);
    expect(validation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "marker_outside_citable_surface", path: "dosage.routes[0].notes" }),
    ]));
  });

  it("ignores pre-existing markers and object key order in excluded sections during article-wide validation", () => {
    const article = {
      ...createArticle(),
      dosage: {
        routes: [
          {
            notes: "Excluded dosage text.[cite:legacy-dose]",
            route: "oral",
          },
        ],
      },
    };
    const candidateArticle = {
      ...article,
      summary: "2C-B is a psychedelic phenethylamine[cite:shulgin1991] first synthesized in the 1970s.",
      dosage: {
        routes: [
          {
            route: "oral",
            notes: "Excluded dosage text.[cite:legacy-dose]",
          },
        ],
      },
    };

    const validation = validateArticleMarkerCandidate({
      originalArticle: article,
      candidateArticle,
      references,
    });

    expect(validation.ok).toBe(true);
    expect(validation.diagnostics).toEqual([]);
  });
});
