import { describe, expect, it } from "vitest";
import {
  buildCitationNumbering,
  collectCitationIdsFromContent,
  dedupeReferences,
  deterministicReferenceId,
} from "./referenceModel";
import {
  MAX_REFERENCE_METADATA_PROVENANCE,
  mergeReferenceMetadata,
  normalizeReferenceMetadataProvenance,
} from "../../../lib/citations/referenceIdentity.mjs";

describe("reference model", () => {
  it("collects citation tokens from article content while ignoring reference metadata", () => {
    expect(collectCitationIdsFromContent({
      summary: "Alpha [cite:a][cite:b].",
      nested: { note: "Again [cite:a]." },
      references: [{ id: "ignored", title: "[cite:ignored]" }],
    })).toEqual(["a", "b"]);
  });

  it("numbers references by first appearance and tracks unknown IDs", () => {
    const numbering = buildCitationNumbering([
      { id: "a", type: "webpage", title: "A", authors: [], url: "https://example.com/a", sourceType: "unknown", quality: "fallback" },
      { id: "b", type: "webpage", title: "B", authors: [], url: "https://example.com/b", sourceType: "unknown", quality: "fallback" },
    ], { summary: "[cite:b] [cite:missing] [cite:a]" });

    expect(numbering.numberedReferences.map((reference) => reference.id)).toEqual(["b", "a"]);
    expect(numbering.numbersById.get("b")).toBe(1);
    expect(numbering.numbersById.get("a")).toBe(2);
    expect(numbering.unknownIds).toEqual(["missing"]);
  });

  it("builds deterministic IDs from persistent identifiers first", () => {
    expect(deterministicReferenceId({ doi: "https://doi.org/10.1000/ABC.1", title: "Paper" })).toBe("doi-10-1000-abc-1");
    expect(deterministicReferenceId({ pmid: "12345", title: "Paper" })).toBe("pmid-12345");
    expect(deterministicReferenceId({ url: "https://erowid.org/chemicals/2cb/", siteName: "Erowid", title: "2C-B" })).toMatch(/^url-erowid-/);
  });

  it("keeps separately cited sections of the same statute distinct", () => {
    const ids = [4, 5, 8].map((section) => deterministicReferenceId({
      title: "Psychoactive Substances Act 2016",
      url: `https://www.legislation.gov.uk/ukpga/2016/2/section/${section}`,
    }));

    expect(new Set(ids).size).toBe(3);
  });

  it("deduplicates references by normalized title when stronger identifiers are unavailable", () => {
    expect(dedupeReferences([
      { id: "worker-a", type: "webpage", title: "Controlled substances list", authors: [], sourceType: "unknown", quality: "fallback" },
      { id: "worker-b", type: "webpage", title: "Controlled Substances List", authors: [], sourceType: "unknown", quality: "fallback" },
    ])).toHaveLength(1);
  });

  it("keeps populated canonical scalars during untrusted runtime dedupe while filling missing metadata", () => {
    const [reference] = dedupeReferences([
      {
        id: "pmid-19322953",
        type: "journal_article",
        title: "Cached title",
        authors: [],
        pmid: "19322953",
        sourceType: "primary_literature",
        quality: "fallback",
        metadataProvenance: [{ kind: "cached", source: "wikipedia-cache", fields: ["title"] }],
      },
      {
        id: "doi-10-1055-s-0028-1109182",
        type: "journal_article",
        title: "The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor",
        authors: [" Markowitz JS ", "markowitz js", "DeVane CL", "Ramamoorthy S", "Zhu HJ"],
        pmid: "19322953",
        doi: "10.1055/s-0028-1109182",
        containerTitle: "Die Pharmazie",
        sourceType: "primary_literature",
        quality: "high",
        metadataProvenance: [{ kind: "inspected", source: "citation-workbench" }],
      },
    ] as never[]);

    expect(reference).toMatchObject({
      id: "pmid-19322953",
      title: "Cached title",
      authors: ["Markowitz JS", "DeVane CL", "Ramamoorthy S", "Zhu HJ"],
      doi: "10.1055/s-0028-1109182",
      containerTitle: "Die Pharmazie",
      quality: "high",
    });
    expect(reference.metadataProvenance).toHaveLength(2);
  });

  it("allows a trusted workflow to prefer an inspected scalar over cached metadata", () => {
    expect(mergeReferenceMetadata(
      {
        id: "pmid-19322953",
        title: "Cached title",
        authors: [],
        pmid: "19322953",
        metadataProvenance: [{ kind: "cached", source: "wikipedia-cache", fields: ["title"] }],
      },
      {
        id: "doi-10-1055-s-0028-1109182",
        title: "Inspected title",
        authors: ["Markowitz JS"],
        pmid: "19322953",
        metadataProvenance: [{ kind: "inspected", source: "citation-workbench", fields: ["title", "authors"] }],
      },
      { allowTrustedScalarOverride: true },
    )).toMatchObject({
      id: "pmid-19322953",
      title: "Inspected title",
      authors: ["Markowitz JS"],
    });
  });

  it("bounds metadata provenance while retaining higher-ranked inspected lineage", () => {
    const provenance = normalizeReferenceMetadataProvenance([
      ...Array.from({ length: MAX_REFERENCE_METADATA_PROVENANCE + 5 }, (_unused, index) => ({
        kind: "imported",
        source: `cache-${index}`,
      })),
      { kind: "inspected", source: "reviewed-source", fields: ["authors"] },
    ]);

    expect(provenance).toHaveLength(MAX_REFERENCE_METADATA_PROVENANCE);
    expect(provenance).toContainEqual({
      kind: "inspected",
      source: "reviewed-source",
      fields: ["authors"],
    });
  });

  it("preserves a populated canonical scalar conflict without explicit higher-ranked provenance", () => {
    expect(mergeReferenceMetadata(
      { id: "stored", title: "Canonical title", authors: ["Author A"] },
      { id: "alias", title: "Conflicting import", authors: [], pmid: "19322953" },
    )).toMatchObject({
      id: "stored",
      title: "Canonical title",
      authors: ["Author A"],
      pmid: "19322953",
    });
  });
});
