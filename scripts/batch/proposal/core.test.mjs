import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildSectionProposal,
  canonicalHash,
  diffValues,
  sha256Text,
  verifyManifest,
  writeImmutableManifest,
} from "./core.mjs";

const temporaryDirectories = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("proposal integrity primitives", () => {
  it("canonical hashes ignore object key order, distinguish missing from null, and implement SHA-256", () => {
    expect(canonicalHash({ b: 2, a: 1 })).toBe(canonicalHash({ a: 1, b: 2 }));
    expect(canonicalHash({})).not.toBe(canonicalHash({ value: null }));
    expect(sha256Text("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(() => canonicalHash({ value: undefined })).toThrow(/undefined/);
  });

  it("writes and verifies an exclusive immutable manifest and rejects overwrite", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "dosewiki-proposal-"));
    temporaryDirectories.push(directory);
    const path = resolve(directory, "target-manifest.json");
    const manifest = writeImmutableManifest(path, {
      schemaVersion: "test-v1",
      exactPrompt: "line one\nline two  \n",
      exactExcerpt: "quoted bytes\n\tunchanged",
    });

    expect(verifyManifest(JSON.parse(readFileSync(path, "utf8")))).toBe(manifest.manifestDigest);
    expect(JSON.parse(readFileSync(path, "utf8")).exactPrompt).toBe("line one\nline two  \n");
    expect(() => writeImmutableManifest(path, manifest)).toThrow();
  });

  it("treats arrays atomically while reporting nested JSON-pointer differences", () => {
    expect(diffValues(
      { summary: { text: "before", tags: ["a", "b"] } },
      { summary: { text: "after", tags: ["a", "c"] } },
    )).toEqual([
      expect.objectContaining({ path: "/summary/tags" }),
      expect.objectContaining({ path: "/summary/text" }),
    ]);
  });

  it("preserves target citation markers while stripping generated marker changes", () => {
    const proposal = buildSectionProposal({
      slug: "2c-b",
      targetDeploymentFingerprint: "target-test",
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

  it("allows only the selected top-level section and rejects malicious cross-section changes", () => {
    const normal = buildSectionProposal({
      slug: "2c-b",
      targetDeploymentFingerprint: "target-test",
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
      targetDeploymentFingerprint: "target-test",
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
      targetDeploymentFingerprint: "target-test",
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
