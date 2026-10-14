import { describe, expect, it } from "vitest";

import { buildSectionProposal } from "./core.mjs";

describe("proposal integrity primitives", () => {
  it("preserves target citation markers while stripping generated marker changes", () => {
    const proposal = buildSectionProposal({
      slug: "2c-b",
      targetDeploymentFingerprint: "localhost/target-test",
      targetArticle: {
        slug: "2c-b",
        summary: "Existing definition.[cite:existing-definition]",
      },
      sectionKey: "summary",
      generatedValue: "New definition. New detail.[cite:unreviewed-model-source]",
      manifestDigest: "digest",
      manifestPath: "manifest.json",
      rawResponse: "summary: New definition.",
    });

    expect(proposal.proposedArticle.summary).toBe(
      "New definition.[cite:existing-definition] New detail.",
    );
    expect(proposal.proposedArticle.summary).not.toContain("unreviewed-model-source");
  });

  it("rejects a generated structure that drops a citation-bearing leaf", () => {
    expect(() => buildSectionProposal({
      slug: "1b-lsd",
      targetDeploymentFingerprint: "localhost/target-test",
      targetArticle: {
        slug: "1b-lsd",
        pharmacology: { pharmacodynamics: "Supported.[cite:existing]" },
      },
      sectionKey: "pharmacology",
      generatedValue: {},
      manifestDigest: "digest",
      manifestPath: "manifest.json",
      rawResponse: "pharmacology: {}",
    })).toThrow(/generated field is missing/);
  });

  it("allows only the selected top-level section and rejects malicious cross-section changes", () => {
    const normal = buildSectionProposal({
      slug: "2c-b",
      targetDeploymentFingerprint: "localhost/target-test",
      targetArticle: { slug: "2c-b", summary: "before", legality: { countries: {} } },
      sectionKey: "summary",
      generatedValue: "after",
      manifestDigest: "digest",
      manifestPath: "manifest.json",
      rawResponse: "summary: after",
    });
    expect(normal.status).toBe("ready_for_review");
    expect(normal.observedChangedTopLevelFields).toEqual(["summary"]);

    const malicious = buildSectionProposal({
      slug: "2c-b",
      targetDeploymentFingerprint: "localhost/target-test",
      targetArticle: { slug: "2c-b", summary: "before", legality: { countries: {} } },
      sectionKey: "summary",
      generatedValue: "after",
      manifestDigest: "digest",
      manifestPath: "manifest.json",
      rawResponse: "summary: after",
      candidateBuilder: (article, section, value) => ({
        ...article,
        [section]: value,
        legality: { countries: { unsafe: true } },
      }),
    });
    expect(malicious.status).toBe("rejected");
    expect(malicious.guard.rejectionReasons).toEqual(["unexpected_cross_section_change"]);
  });

  it("rejects dosage, duration, and unrelated changes from a pharmacology proposal", () => {
    const proposal = buildSectionProposal({
      slug: "2c-b",
      targetDeploymentFingerprint: "localhost/target-test",
      targetArticle: {
        slug: "2c-b",
        pharmacology: { pharmacodynamics: "before" },
        dosage: { routes: [{ route: "Oral", bioavailability: "" }] },
        duration: { routes: [{ route: "Oral", half_life: "" }] },
        legality: { countries: {} },
      },
      sectionKey: "pharmacology",
      generatedValue: {
        pharmacodynamics: "after",
        route_bioavailability: { Oral: "60%" },
        route_half_life: { Oral: "3 hours" },
      },
      manifestDigest: "digest",
      manifestPath: "manifest.json",
      rawResponse: "pharmacology: after",
      publicationProfile: "pharmacology",
      publicationFields: ["pharmacology", "dosage", "duration"],
      candidateBuilder: (article, section, value) => ({
        ...article,
        [section]: value,
        dosage: { routes: [{ route: "Oral", bioavailability: "60%" }] },
        duration: { routes: [{ route: "Oral", half_life: "3 hours" }] },
        legality: { countries: { unsafe: true } },
      }),
    });

    expect(proposal.status).toBe("rejected");
    expect(proposal.observedChangedTopLevelFields).toEqual([
      "dosage",
      "duration",
      "legality",
      "pharmacology",
    ]);
    expect(proposal.guard.allowedTopLevelFields).toEqual(["pharmacology"]);
    expect(proposal.guard.rejectionReasons).toEqual(["unexpected_cross_section_change"]);
  });
});
