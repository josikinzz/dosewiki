import { describe, expect, it } from "vitest";

import {
  buildReferenceProvenanceBackfillProposal,
  runPlanReferenceProvenanceBackfill,
  sameSemanticJson,
} from "./plan-reference-metadata-provenance-backfill.mjs";
import { mutationSetSha256 } from "./validate-citation-author-repair-lineage.mjs";

const digest = (character) => character.repeat(64);

function fixture() {
  const articles = [];
  const waves = [];
  const evidenceRows = [];
  for (const [name, count, prefix] of [
    ["deterministic-high-confidence", 74, "f"],
    ["independently-reviewed-residual", 685, "i"],
  ]) {
    const referenceProviders = {};
    const manualEvidence = {};
    for (let index = 0; index < count; index += 1) {
      const slug = `${prefix}-${String(index).padStart(3, "0")}`;
      const referenceId = `pmid-${prefix}${index}`;
      const key = `${slug}::${referenceId}`;
      const authors = [`Author ${prefix}${index}`];
      const title = `Title ${prefix}${index}`;
      const pmid = String((prefix === "f" ? 100000 : 200000) + index);
      const fetched = prefix === "f";
      referenceProviders[key] = index === 0 && !fetched ? [] : ["pubmed"];
      articles.push({ slug, references: [{ id: referenceId, title, authors, pmid }] });
      if (index === 0 && !fetched) {
        manualEvidence[key] = {
          method: "independent_authoritative_source_review",
          evidenceDomains: ["pubmed.ncbi.nlm.nih.gov"],
          identifiers: { doi: null, pmid },
          reviewResultSha256: digest("1"),
          refutationArtifactSha256: digest("2"),
        };
      }
      evidenceRows.push({
        key,
        slug,
        referenceId,
        wave: name,
        authors,
        storedIdentity: {
          title,
          normalizedTitle: title.toLowerCase(),
          normalizedIdentityTitle: title.toLowerCase(),
          doi: null,
          pmid,
        },
        identifiers: { doi: null, pmid },
        titles: [{ title, normalizedTitle: title.toLowerCase(), normalizedIdentityTitle: title.toLowerCase() }],
        identityMatchBasis: "title_and_identifier",
        provenance: fetched ? [{
          kind: "fetched",
          source: "citation-author-repair:pmid",
          identifierLane: "pmid",
          provider: "pubmed",
          authoritativeDomains: ["pubmed.ncbi.nlm.nih.gov"],
        }] : [{
          kind: "inspected",
          source: "citation-author-repair:review-result",
          identifierLane: "pmid",
          provider: "pubmed.ncbi.nlm.nih.gov",
          authoritativeDomains: ["pubmed.ncbi.nlm.nih.gov"],
        }, {
          kind: "inspected",
          source: "citation-author-repair:independent-refutation",
          identifierLane: "pmid",
          provider: "ncbi.nlm.nih.gov",
          authoritativeDomains: ["ncbi.nlm.nih.gov"],
        }],
        sourceBinding: {
          proposalArtifactSha256: fetched ? digest("a") : digest("f"),
          auditFileSha256: digest("3"),
          approvalFileSha256: digest("4"),
          mutationSha256: digest("5"),
          ...(fetched ? {} : {
            reviewResultSha256: digest("8"),
            reviewResultArtifactSha256: digest("b"),
            refutationArtifactSha256: digest("d"),
            primaryReviewerIdentifier: "primary",
            refutationReviewerIdentifier: "refuter",
          }),
        },
      });
    }
    const proposalArtifactSha256 = fetchedWave(name) ? digest("a") : digest("f");
    waves.push({
      name,
      proposalArtifactSha256,
      successfulMutationCount: count,
      sourceArtifacts: {
        audit: { path: `audit-${prefix}.json`, fileSha256: digest("3") },
        approval: { path: `approval-${prefix}.json`, fileSha256: digest("4") },
      },
      mutationSetSha256: mutationSetSha256(referenceProviders),
      referenceProviders,
      ...(Object.keys(manualEvidence).length ? { manualEvidence } : {}),
    });
  }
  const evidenceBundle = {
    artifactType: "citation_author_repair_evidence_bundle",
    artifactVersion: 1,
    sourceDeployment: "example",
    rows: evidenceRows,
    bundleDigest: digest("7"),
  };
  const lineage = {
    artifactType: "citation_author_repair_lineage_manifest",
    artifactVersion: 2,
    mutationSetCanonicalization: "sorted keys",
    evidenceBundle: { path: "evidence.json", fileSha256: digest("6"), bundleDigest: digest("7"), rowCount: 759 },
    waves,
  };
  return { lineage, evidenceBundle, evidenceBundleFileSha256: digest("6"), articles };
}

function fetchedWave(name) {
  return name === "deterministic-high-confidence";
}

function build(values = fixture()) {
  return buildReferenceProvenanceBackfillProposal({
    ...values,
    lineageManifestSha256: digest("9"),
    lineageManifestPath: "scripts/data/tracked/citation-author-repair-lineage.json",
    sourceDeployment: "example/dosewiki",
    generatedAt: "2026-08-10T00:00:00.000Z",
  });
}

describe("reference metadata provenance backfill planner", () => {
  it("builds exactly 74 fetched and 685 inspected rows from tracked evidence", () => {
    const proposal = build();
    expect(proposal.summary).toEqual({ rows: 759, fetched: 74, inspected: 685 });
    expect(proposal.rows).toHaveLength(759);
    expect(proposal.evidenceBundle).toMatchObject({ fileSha256: digest("6"), bundleDigest: digest("7") });
    const fetched = proposal.rows.find((row) => row.wave === "deterministic-high-confidence");
    expect(fetched.proposedMetadataProvenance).toContainEqual(expect.objectContaining({
      kind: "fetched",
      provider: "pubmed",
      artifactDigest: digest("a"),
    }));
    const inspected = proposal.rows.find((row) => row.key === "i-000::pmid-i0");
    expect(inspected.proposedMetadataProvenance).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "inspected", provider: "pubmed.ncbi.nlm.nih.gov" }),
      expect.objectContaining({ kind: "inspected", provider: "ncbi.nlm.nih.gov" }),
    ]));
    expect(inspected.sourceBinding.evidenceBundleDigest).toBe(digest("7"));
  });

  it("fails closed on non-unique articles and changed identity, authors, or evidence", () => {
    const duplicate = fixture();
    duplicate.articles.push(structuredClone(duplicate.articles[0]));
    expect(() => build(duplicate)).toThrow(/exactly one live article/i);

    const stale = fixture();
    stale.articles[0].references[0].authors = ["Changed Author"];
    expect(() => build(stale)).toThrow(/evidence authors do not match live authors/i);

    const replaced = fixture();
    replaced.articles[0].references[0].title = "Different work";
    expect(() => build(replaced)).toThrow(/stored title does not match live title/i);

    const contradicted = fixture();
    contradicted.evidenceBundle.rows[0].identifiers.pmid = "999999";
    expect(() => build(contradicted)).toThrow(/evidence PMID contradicts live PMID/i);
  });

  it("accepts alphabetized Postgres object keys after application", () => {
    const applied = fixture();
    const initial = build(applied);
    const rowsByKey = new Map(initial.rows.map((row) => [row.key, row]));
    for (const article of applied.articles) {
      for (const reference of article.references) {
        const row = rowsByKey.get(`${article.slug}::${reference.id}`);
        reference.metadataProvenance = row.proposedMetadataProvenance.map((entry) => Object.fromEntries(
          Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)),
        ));
      }
    }

    expect(() => build(applied)).not.toThrow();
    expect(sameSemanticJson(
      { source: "pubmed", fields: ["authors", "title"] },
      { fields: ["authors", "title"], source: "pubmed" },
    )).toBe(true);
  });

  it("keeps values and array order significant during semantic comparison", () => {
    expect(sameSemanticJson({ source: "pubmed" }, { source: "crossref" })).toBe(false);
    expect(sameSemanticJson(
      { fields: ["authors", "title"] },
      { fields: ["title", "authors"] },
    )).toBe(false);
  });

  it("rejects every write-like planner invocation before network access", async () => {
    await expect(runPlanReferenceProvenanceBackfill(["--write"], {})).rejects.toThrow(/read-only/i);
    await expect(runPlanReferenceProvenanceBackfill(["--execute"], {})).rejects.toThrow(/read-only/i);
  });
});
