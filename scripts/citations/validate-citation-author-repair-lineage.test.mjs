import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LINEAGE_MANIFEST,
  mutationSetSha256,
  validateCitationAuthorRepairLineage,
  validateLineageFile,
} from "./validate-citation-author-repair-lineage.mjs";

function manifest() {
  return JSON.parse(fs.readFileSync(DEFAULT_LINEAGE_MANIFEST, "utf8"));
}

describe("citation author repair lineage manifest", () => {
  it("validates exact two-wave coverage and available source bindings", () => {
    expect(validateLineageFile()).toMatchObject({
      valid: true,
      references: 759,
      evidenceRows: 759,
      evidenceBundleDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      canonicalMetadataProvenanceBackfill: {
        status: "completed",
        references: 759,
        proposalArtifactSha256: "8d19afa96040694258ceb4ab0f1f0ca51d3f1974259c78d19c2e042dd3b1ddfb",
        approvalArtifactSha256: "205b88f2abf08bdc0bab46a503c407ccf445d1362c3cb01221e9b33fe882ce48",
        auditFileSha256: "291234ed30de42165bb4504d8a3f67236a8325aca7dc3e6fb54aac0d4bc8584d",
        bindingSha256: "dddeb8b24f740dba1bee349bedb4f38bfd89693fbc6e20e5b0bfbde978501dcd",
      },
      waves: [
        { name: "deterministic-high-confidence", references: 74, manualEvidence: 0 },
        { name: "independently-reviewed-residual", references: 685, manualEvidence: 3 },
      ],
    });
  });

  it("validates from the tracked bundle when ignored source artifacts are unavailable", () => {
    const input = manifest();
    for (const wave of input.waves) {
      for (const binding of Object.values(wave.sourceArtifacts)) binding.path = `tmp/unavailable/${binding.path.split("/").at(-1)}`;
    }
    expect(validateCitationAuthorRepairLineage(input, { verifyFiles: false })).toMatchObject({
      valid: true,
      references: 759,
      evidenceRows: 759,
    });
  });

  it("fails when a mutation-set digest no longer matches canonical sorted keys", () => {
    const input = manifest();
    input.waves[0].referenceProviders["extra::reference"] = ["crossref"];
    input.waves[0].successfulMutationCount += 1;
    input.waves[0].mutationSetSha256 = mutationSetSha256(input.waves[0].referenceProviders);

    expect(() => validateCitationAuthorRepairLineage(input, { verifyFiles: false }))
      .toThrow("successfulMutationCount must be 74");
  });

  it("requires the tracked evidence bundle and its exact hash binding", () => {
    const input = manifest();
    input.evidenceBundle.fileSha256 = "0".repeat(64);
    expect(() => validateCitationAuthorRepairLineage(input, { verifyFiles: false }))
      .toThrow(/evidenceBundle file SHA-256 mismatch/);
  });

  it("requires manual authoritative evidence for every row without a provider", () => {
    const input = manifest();
    delete input.waves[1].manualEvidence["temazepam::pmid-38261668"];

    expect(() => validateCitationAuthorRepairLineage(input, { verifyFiles: false }))
      .toThrow("manualEvidence must cover exactly the empty-provider rows");
  });

  it("hash-binds the completed canonical provenance backfill statement", () => {
    const input = manifest();
    input.canonicalMetadataProvenanceBackfill.postApplyVerification.alreadyApplied = 758;

    expect(() => validateCitationAuthorRepairLineage(input, { verifyFiles: false }))
      .toThrow(/post-apply verification mismatch/);

    const alteredDigest = manifest();
    alteredDigest.canonicalMetadataProvenanceBackfill.approvalArtifactSha256 = "0".repeat(64);
    expect(() => validateCitationAuthorRepairLineage(alteredDigest, { verifyFiles: false }))
      .toThrow(/approval digest mismatch/);

    const alteredAudit = manifest();
    alteredAudit.canonicalMetadataProvenanceBackfill.completedAudit.fileSha256 = "0".repeat(64);
    expect(() => validateCitationAuthorRepairLineage(alteredAudit, { verifyFiles: false }))
      .toThrow(/audit SHA-256 mismatch/);
  });
});
