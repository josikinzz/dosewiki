import { describe, expect, it } from "vitest";

import { FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION } from "./formal-citations-contract.mjs";
import {
  buildFormalCitationDraft,
  buildFormalCitationDraftFromAgent,
} from "./formal-citations-core.mjs";
import { deterministicReferenceId } from "../../lib/citations/referenceIdentity.mjs";

describe("formal citations core draft building", () => {
  it("creates a reviewable draft with stable references, inline tokens, and evidence rows", () => {
    const article = {
      id: 1,
      slug: "2c-b",
      title: "2C-B",
      source_citations: [{ name: "Erowid", url: "https://erowid.org/chemicals/2cb/" }],
      citations: [],
      references: [],
      pharmacology: { pharmacodynamics: "2C-B is a psychedelic phenethylamine.", pharmacokinetics: "" },
      harm_potential: { summary: "High doses may be more physically uncomfortable." },
      history_culture: { content: "" },
      legality: { countries: { US: { status: "controlled", notes: "2C-B is Schedule I." } } },
      tolerance: { full_tolerance: "", half_tolerance: "", baseline_tolerance: "", cross_tolerance: [] },
      dosage: { routes: [{ route: "oral", dose_ranges: {}, notes: "" }] },
      duration: { routes: [{ route: "oral", stages: {} }] },
    };

    const draft = buildFormalCitationDraft({
      article,
      articleSources: {
        sources: [{ id: "erowid", displayName: "Erowid", fileName: "erowid.md", size: 10, tokens: 2 }],
        contents: { erowid: "Dosage duration pharmacology 2C-B is discussed here with legality notes." },
      },
    });

    expect(draft.references[0].id).toMatch(/^url-erowid-/);
    expect(draft.article.pharmacology.pharmacodynamics).toContain(`[cite:${draft.references[0].id}]`);
    expect(draft.article.dosage.routes[0].reference_ids ?? []).toEqual([]);
    expect(draft.article.duration.routes[0].reference_ids ?? []).toEqual([]);
    expect(draft.evidence.map((row) => row.status)).toContain("needs_review");
    expect(draft.evidence.every((row) => row.claimKey && Array.isArray(row.referenceIds))).toBe(true);
  });

  it("merges supported agent decisions into prose and structured fields deterministically", () => {
    const article = {
      id: 1,
      slug: "2c-b",
      title: "2C-B",
      source_citations: [{ name: "Erowid", url: "https://erowid.org/chemicals/2cb/" }],
      citations: [],
      references: [
        {
          id: "pmid-12345",
          type: "journal_article",
          title: "PubMed Article",
          authors: [],
          siteName: "PubMed",
          url: "https://pubmed.ncbi.nlm.nih.gov/12345/",
          pmid: "12345",
          sourceType: "medical_database",
          quality: "high",
        },
      ],
      pharmacology: { pharmacodynamics: "2C-B is a psychedelic phenethylamine.", pharmacokinetics: "" },
      harm_potential: { summary: "" },
      history_culture: { content: "" },
      legality: { countries: {} },
      tolerance: { full_tolerance: "", half_tolerance: "", baseline_tolerance: "", cross_tolerance: [] },
      dosage: { routes: [{ route: "oral", dose_ranges: {}, notes: "" }] },
      duration: { routes: [{ route: "oral", stages: {} }] },
    };

    const draft = buildFormalCitationDraftFromAgent({
      article,
      articleSources: {
        sources: [{ id: "erowid", displayName: "Erowid", fileName: "erowid.md", size: 10, tokens: 2 }],
        contents: { erowid: "Pharmacology discussion and route notes." },
      },
      sectionResults: [
        {
          schemaVersion: FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION,
          sectionKey: "pharmacology",
          diagnostics: [],
          validationSummary: {
            targetCount: 1,
            emittedClaimCount: 1,
            diagnosticCount: 0,
            downgradedClaimCount: 0,
          },
          claims: [
            {
              claimKey: "pharmacology:pharmacology.pharmacodynamics",
              fieldPath: "pharmacology.pharmacodynamics",
              claimText: "2C-B is a psychedelic phenethylamine.",
              status: "supported",
              originalStatus: "supported",
              statusReason: "",
              referenceIds: ["url-erowid-abc123", "pmid-12345"],
              supports: [
                {
                  sourceId: "erowid",
                  sourceName: "Erowid",
                  referenceId: "url-erowid-abc123",
                  sourceType: "experience_archive",
                  quality: "low",
                  supportingQuote: "Direct supporting quote",
                  rationale: "Direct support",
                  verifiedQuote: {
                    sourceId: "erowid",
                    matchType: "exact",
                    startOffset: 0,
                    endOffset: 23,
                  },
                },
                {
                  sourceId: "erowid",
                  sourceName: "Erowid",
                  referenceId: "pmid-12345",
                  sourceType: "medical_database",
                  quality: "high",
                  supportingQuote: "Direct supporting quote",
                  rationale: "Secondary support",
                  verifiedQuote: {
                    sourceId: "erowid",
                    matchType: "exact",
                    startOffset: 0,
                    endOffset: 23,
                  },
                },
              ],
              diagnostics: [],
            },
          ],
        },
      ],
    });

    expect(draft.article.pharmacology.pharmacodynamics).toContain("[cite:pmid-12345][cite:url-erowid-");
    expect(draft.article.dosage.routes[0].reference_ids ?? []).toEqual([]);
    expect(draft.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        claimKey: "pharmacology:pharmacology.pharmacodynamics",
        status: "supported",
        referenceIds: ["pmid-12345", expect.stringMatching(/^url-erowid-/)],
      }),
    ]));
  });

  it("keeps the stored marker ID canonical and remaps identity-equivalent aliases before persistence", () => {
    const canonicalId = "url-erowid-legacy01";
    const article = {
      id: 1,
      slug: "2c-b",
      title: "2C-B",
      source_citations: [{ name: "Erowid", url: "https://erowid.org/chemicals/2cb/" }],
      citations: [],
      references: [
        {
          id: "url-erowid-legacy01",
          type: "webpage",
          title: "2C-B",
          authors: [],
          siteName: "Erowid",
          url: "https://erowid.org/chemicals/2cb/",
          sourceType: "experience_archive",
          quality: "low",
        },
      ],
      pharmacology: { pharmacodynamics: "2C-B is a psychedelic phenethylamine. [cite:url-erowid-legacy01]", pharmacokinetics: "" },
      harm_potential: { summary: "" },
      history_culture: { content: "" },
      legality: { countries: {} },
      tolerance: { full_tolerance: "", half_tolerance: "", baseline_tolerance: "", cross_tolerance: [] },
      dosage: { routes: [{ route: "oral", dose_ranges: {}, notes: "", reference_ids: ["url-erowid-legacy01"] }] },
      duration: { routes: [{ route: "oral", stages: {}, reference_ids: ["url-erowid-legacy01"] }] },
    };

    const draft = buildFormalCitationDraftFromAgent({
      article,
      sectionResults: [],
    });

    expect(draft.references).toHaveLength(1);
    expect(draft.references[0].id).toBe(canonicalId);
    expect(draft.article.pharmacology.pharmacodynamics).toContain(`[cite:${canonicalId}]`);
    expect(draft.article.pharmacology.pharmacodynamics).not.toContain(
      deterministicReferenceId({
        url: "https://erowid.org/chemicals/2cb/",
        siteName: "Erowid",
        title: "2C-B",
      }),
    );
    expect(draft.article.dosage.routes[0].reference_ids).toEqual([canonicalId]);
    expect(draft.article.duration.routes[0].reference_ids).toEqual([canonicalId]);
  });

  it("preserves approved evidence by default and reports proposed replacements, stale evidence, and stale references", () => {
    const article = {
      id: 1,
      slug: "2c-b",
      title: "2C-B",
      source_citations: [],
      citations: [],
      references: [
        {
          id: "pmid-12345",
          type: "journal_article",
          title: "PubMed Article",
          authors: [],
          siteName: "PubMed",
          url: "https://pubmed.ncbi.nlm.nih.gov/12345/",
          pmid: "12345",
          sourceType: "medical_database",
          quality: "high",
        },
      ],
      pharmacology: {
        pharmacodynamics: "2C-B is a psychedelic phenethylamine. [cite:stale-inline-ref]",
        pharmacokinetics: "",
      },
      harm_potential: { summary: "" },
      history_culture: { content: "" },
      legality: { countries: {} },
      tolerance: { full_tolerance: "", half_tolerance: "", baseline_tolerance: "", cross_tolerance: [] },
      dosage: { routes: [] },
      duration: { routes: [] },
    };

    const draft = buildFormalCitationDraftFromAgent({
      article,
      existingEvidence: [
        {
          section: "pharmacology",
          claimKey: "pharmacology:pharmacology.pharmacodynamics",
          fieldPath: "pharmacology.pharmacodynamics",
          claimText: "2C-B is a psychedelic phenethylamine.",
          referenceIds: ["pmid-12345"],
          status: "approved",
          statusReason: "Reviewed by editor",
          severity: "blocking",
          supports: [
            {
              sourceId: "pubmed",
              sourceName: "PubMed",
              referenceId: "pmid-12345",
              sourceType: "medical_database",
              quality: "high",
              supportingQuote: "Direct supporting quote",
              rationale: "Approved support",
              verifiedQuote: {
                sourceId: "pubmed",
                matchType: "exact",
                startOffset: 0,
                endOffset: 23,
              },
            },
          ],
        },
        {
          section: "pharmacology",
          claimKey: "pharmacology:legacy-removed-claim",
          fieldPath: "pharmacology.legacy",
          claimText: "Legacy removed claim",
          referenceIds: ["pmid-12345"],
          status: "needs_review",
          statusReason: "Old row",
          severity: "blocking",
          supports: [
            {
              sourceId: "pubmed",
              sourceName: "PubMed",
              referenceId: "pmid-12345",
              sourceType: "medical_database",
              quality: "high",
              supportingQuote: "Legacy quote",
              rationale: "Legacy rationale",
              verifiedQuote: {
                sourceId: "pubmed",
                matchType: "exact",
                startOffset: 0,
                endOffset: 12,
              },
            },
          ],
        },
      ],
      sectionResults: [
        {
          schemaVersion: FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION,
          sectionKey: "pharmacology",
          diagnostics: [],
          validationSummary: {
            targetCount: 1,
            emittedClaimCount: 1,
            diagnosticCount: 0,
            downgradedClaimCount: 0,
          },
          claims: [
            {
              claimKey: "pharmacology:pharmacology.pharmacodynamics",
              fieldPath: "pharmacology.pharmacodynamics",
              claimText: "2C-B is a psychedelic phenethylamine.",
              status: "needs_review",
              originalStatus: "needs_review",
              statusReason: "Agent wants manual review",
              referenceIds: [],
              supports: [],
              diagnostics: [],
            },
          ],
        },
      ],
    });

    expect(draft.article.pharmacology.pharmacodynamics).toContain("[cite:pmid-12345]");
    expect(draft.article.pharmacology.pharmacodynamics).not.toContain("stale-inline-ref");
    expect(draft.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        claimKey: "pharmacology:pharmacology.pharmacodynamics",
        status: "approved",
        referenceIds: ["pmid-12345"],
      }),
    ]));
    expect(draft.preservedApproved).toEqual([
      expect.objectContaining({
        claimKey: "pharmacology:pharmacology.pharmacodynamics",
        differsFromRerun: true,
      }),
    ]);
    expect(draft.proposedReplacements).toEqual([
      expect.objectContaining({
        claimKey: "pharmacology:pharmacology.pharmacodynamics",
        applied: false,
      }),
    ]);
    expect(draft.staleEvidence).toEqual([
      expect.objectContaining({
        claimKey: "pharmacology:legacy-removed-claim",
        action: "preserve",
      }),
    ]);
    expect(draft.staleReferences).toEqual([
      expect.objectContaining({
        claimKey: "pharmacology:pharmacology.pharmacodynamics",
        removedReferenceIds: ["stale-inline-ref"],
        unknownReferenceIds: ["stale-inline-ref"],
      }),
    ]);
  });

  it("replace-approved mode refreshes in-scope rows and marks stale evidence for deletion", () => {
    const article = {
      id: 1,
      slug: "2c-b",
      title: "2C-B",
      source_citations: [],
      citations: [],
      references: [
        {
          id: "pmid-12345",
          type: "journal_article",
          title: "PubMed Article",
          authors: [],
          siteName: "PubMed",
          url: "https://pubmed.ncbi.nlm.nih.gov/12345/",
          pmid: "12345",
          sourceType: "medical_database",
          quality: "high",
        },
      ],
      pharmacology: {
        pharmacodynamics: "2C-B is a psychedelic phenethylamine. [cite:pmid-12345]",
        pharmacokinetics: "",
      },
      harm_potential: { summary: "" },
      history_culture: { content: "" },
      legality: { countries: {} },
      tolerance: { full_tolerance: "", half_tolerance: "", baseline_tolerance: "", cross_tolerance: [] },
      dosage: { routes: [] },
      duration: { routes: [] },
    };

    const draft = buildFormalCitationDraftFromAgent({
      article,
      approvedWriteMode: "replace",
      existingEvidence: [
        {
          section: "pharmacology",
          claimKey: "pharmacology:pharmacology.pharmacodynamics",
          fieldPath: "pharmacology.pharmacodynamics",
          claimText: "2C-B is a psychedelic phenethylamine.",
          referenceIds: ["pmid-12345"],
          status: "approved",
          statusReason: "Reviewed by editor",
          severity: "blocking",
          supports: [
            {
              sourceId: "pubmed",
              sourceName: "PubMed",
              referenceId: "pmid-12345",
              sourceType: "medical_database",
              quality: "high",
              supportingQuote: "Direct supporting quote",
              rationale: "Approved support",
              verifiedQuote: {
                sourceId: "pubmed",
                matchType: "exact",
                startOffset: 0,
                endOffset: 23,
              },
            },
          ],
        },
        {
          section: "pharmacology",
          claimKey: "pharmacology:legacy-removed-claim",
          fieldPath: "pharmacology.legacy",
          claimText: "Legacy removed claim",
          referenceIds: ["pmid-12345"],
          status: "needs_review",
          statusReason: "Old row",
          severity: "blocking",
          supports: [
            {
              sourceId: "pubmed",
              sourceName: "PubMed",
              referenceId: "pmid-12345",
              sourceType: "medical_database",
              quality: "high",
              supportingQuote: "Legacy quote",
              rationale: "Legacy rationale",
              verifiedQuote: {
                sourceId: "pubmed",
                matchType: "exact",
                startOffset: 0,
                endOffset: 12,
              },
            },
          ],
        },
      ],
      sectionResults: [
        {
          schemaVersion: FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION,
          sectionKey: "pharmacology",
          diagnostics: [],
          validationSummary: {
            targetCount: 1,
            emittedClaimCount: 1,
            diagnosticCount: 0,
            downgradedClaimCount: 0,
          },
          claims: [
            {
              claimKey: "pharmacology:pharmacology.pharmacodynamics",
              fieldPath: "pharmacology.pharmacodynamics",
              claimText: "2C-B is a psychedelic phenethylamine.",
              status: "needs_source",
              originalStatus: "needs_source",
              statusReason: "No direct support in rerun",
              referenceIds: [],
              supports: [],
              diagnostics: [],
            },
          ],
        },
      ],
    });

    expect(draft.article.pharmacology.pharmacodynamics).not.toContain("[cite:");
    expect(draft.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        claimKey: "pharmacology:pharmacology.pharmacodynamics",
        status: "needs_source",
        referenceIds: [],
      }),
    ]));
    expect(draft.proposedReplacements).toEqual([
      expect.objectContaining({
        claimKey: "pharmacology:pharmacology.pharmacodynamics",
        applied: true,
      }),
    ]);
    expect(draft.staleEvidence).toEqual([
      expect.objectContaining({
        claimKey: "pharmacology:legacy-removed-claim",
        action: "delete",
      }),
    ]);
  });
});
