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
      waves: [
        { name: "deterministic-high-confidence", references: 74, manualEvidence: 0 },
        { name: "independently-reviewed-residual", references: 685, manualEvidence: 3 },
      ],
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

  it("requires manual authoritative evidence for every row without a provider", () => {
    const input = manifest();
    delete input.waves[1].manualEvidence["temazepam::pmid-38261668"];

    expect(() => validateCitationAuthorRepairLineage(input, { verifyFiles: false }))
      .toThrow("manualEvidence must cover exactly the empty-provider rows");
  });
});
