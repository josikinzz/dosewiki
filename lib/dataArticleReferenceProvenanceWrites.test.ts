import { describe, expect, it } from "vitest";
import { applyReferenceProvenanceRepair } from "../server/lib/articleReferenceProvenanceWrites";

const fetched = {
  kind: "fetched" as const,
  source: "citation-author-repair:pmid",
  provider: "pubmed",
  artifactDigest: "a".repeat(64),
  fields: ["authors"],
};
const expected = {
  title: "Methylphenidate receptor paper",
  doi: null,
  pmid: "19322953",
  authors: ["Markowitz JS", "DeVane CL", "Ramamoorthy S", "Zhu HJ"],
  metadataProvenance: null,
};

function article(referenceOverrides: Record<string, unknown> = {}) {
  return {
    references: [{
      id: "pmid-19322953",
      type: "journal_article",
      title: expected.title,
      doi: null,
      pmid: expected.pmid,
      authors: expected.authors,
      ...referenceOverrides,
    }],
  };
}

describe("applyReferenceProvenanceRepair", () => {
  it("adds only bounded canonical metadata provenance to one reference", () => {
    const result = applyReferenceProvenanceRepair(article(), {
      referenceId: "pmid-19322953",
      expected,
      proposedMetadataProvenance: [fetched],
    });
    expect(result).toMatchObject({ ok: true, updated: true, reference: { metadataProvenance: [fetched] } });
    if (!result.ok || !result.updated) throw new Error("expected update");
    expect(result.references).toEqual([{ ...article().references[0], metadataProvenance: [fetched] }]);
  });

  it("is idempotent when Postgres returns an equivalent object with alphabetized keys", () => {
    const wireFetched = {
      artifactDigest: fetched.artifactDigest,
      fields: fetched.fields,
      kind: fetched.kind,
      provider: fetched.provider,
      source: fetched.source,
    };
    const result = applyReferenceProvenanceRepair(article({ metadataProvenance: [wireFetched] }), {
      referenceId: "pmid-19322953",
      expected,
      proposedMetadataProvenance: [fetched],
    });
    expect(result).toMatchObject({ ok: true, updated: false });
    if (!result.ok) throw new Error("expected success");
    expect(result.references).toBeUndefined();
  });

  it("preserves array ordering when comparing provenance snapshots", () => {
    const cached = { kind: "cached" as const, source: "legacy", fields: ["authors", "title"] };
    const expectedWithCached = { ...expected, metadataProvenance: [cached] };
    const proposed = [fetched, cached];
    expect(applyReferenceProvenanceRepair(article({
      metadataProvenance: [{ ...cached, fields: ["title", "authors"] }],
    }), {
      referenceId: "pmid-19322953",
      expected: expectedWithCached,
      proposedMetadataProvenance: proposed,
    })).toMatchObject({ ok: false, code: "REFERENCE_CONFLICT" });
  });

  it("refuses stale title, DOI, PMID, authors, or provenance snapshots", () => {
    for (const referenceOverrides of [
      { title: "Changed" },
      { doi: "10.1000/changed" },
      { pmid: "999999" },
      { authors: ["Someone Else"] },
      { metadataProvenance: [{ ...fetched, provider: "crossref" }] },
    ]) {
      expect(applyReferenceProvenanceRepair(article(referenceOverrides), {
        referenceId: "pmid-19322953",
        expected,
        proposedMetadataProvenance: [fetched],
      })).toMatchObject({ ok: false, code: "REFERENCE_CONFLICT" });
    }
  });

  it("rejects missing or duplicate reference ids", () => {
    expect(applyReferenceProvenanceRepair(article(), {
      referenceId: "missing",
      expected,
      proposedMetadataProvenance: [fetched],
    })).toMatchObject({ ok: false, code: "REFERENCE_NOT_FOUND" });
    const duplicate = article();
    duplicate.references.push({ ...duplicate.references[0] });
    expect(applyReferenceProvenanceRepair(duplicate, {
      referenceId: "pmid-19322953",
      expected,
      proposedMetadataProvenance: [fetched],
    })).toMatchObject({ ok: false, code: "REFERENCE_DUPLICATE" });
  });

  it("rejects malformed, noncanonical, conflicting, destructive, or unbounded entries", () => {
    const cached = { kind: "cached" as const, source: "legacy", fields: ["authors"] };
    const expectedWithCached = { ...expected, metadataProvenance: [cached] };
    const document = article({ metadataProvenance: [cached] });
    for (const proposedMetadataProvenance of [
      [],
      [{ ...fetched, source: " fetched " }],
      [{ ...fetched, unknown: "field" }],
      [{ ...fetched, fields: ["authors", "authors"] }],
      [fetched, { ...fetched, kind: "inspected" }],
      Array.from({ length: 33 }, (_, index) => ({ ...fetched, provider: `provider-${index}` })),
      [fetched],
    ]) {
      expect(applyReferenceProvenanceRepair(document, {
        referenceId: "pmid-19322953",
        expected: expectedWithCached,
        proposedMetadataProvenance,
      })).toMatchObject({ ok: false, code: "REFERENCE_WRITE_REJECTED" });
    }
  });
});
