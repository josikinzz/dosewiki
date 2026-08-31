import { describe, expect, it } from "vitest";
import {
  haveCompatibleReferenceIdentity,
  hasUnsafeReferenceMarkup,
  mergeReferenceCollections,
  mergeReferenceMetadata,
  stripReferenceHtmlMarkup,
} from "../../lib/citations/referenceIdentity.mjs";

it("detects raw MediaWiki and ref markup in bibliographic text", () => {
  expect(hasUnsafeReferenceMarkup("Antitussives and substance abuse")).toBe(false);
  expect(hasUnsafeReferenceMarkup('<ref name="paper" />')).toBe(true);
  expect(hasUnsafeReferenceMarkup("[[NMDA receptor]]")).toBe(true);
  expect(hasUnsafeReferenceMarkup("{{cite journal|title=Paper}}")).toBe(true);
  expect(hasUnsafeReferenceMarkup("5-HT<sub>2A</sub> receptor")).toBe(true);
  expect(stripReferenceHtmlMarkup("5-HT<sub>2A</sub> &amp; D<sup>2</sup>")).toBe(
    "5-HT2A & D2",
  );
});

describe("reference identity compatibility", () => {
  it("rejects an overlapping PMID when both DOI values conflict", () => {
    const stored = {
      id: "stored",
      title: "Stored",
      authors: [],
      doi: "10.1000/stored",
      pmid: "19322953",
    };
    const incoming = {
      id: "incoming",
      title: "Incoming",
      authors: ["Author"],
      doi: "10.1000/incoming",
      pmid: "19322953",
    };

    expect(haveCompatibleReferenceIdentity(stored, incoming)).toBe(false);
    const merged = mergeReferenceCollections([], [stored, incoming]);
    expect(merged.references).toHaveLength(2);
    expect(merged.remap.get("incoming")).toBe("incoming");
  });

  it("rejects an overlapping DOI when both PMID values conflict", () => {
    const merged = mergeReferenceCollections([], [{
      id: "stored",
      title: "Stored",
      authors: [],
      doi: "10.1000/shared",
      pmid: "11111",
    }, {
      id: "incoming",
      title: "Incoming",
      authors: [],
      doi: "https://doi.org/10.1000/shared",
      pmid: "22222",
    }]);

    expect(merged.references).toHaveLength(2);
  });

  it("rejects a shared DOI when both canonical URLs conflict", () => {
    const merged = mergeReferenceCollections([], [{
      id: "stored",
      title: "Stored",
      authors: [],
      doi: "10.1000/shared",
      url: "https://publisher.example/paper-a",
    }, {
      id: "incoming",
      title: "Incoming",
      authors: [],
      doi: "10.1000/shared",
      url: "https://publisher.example/paper-b",
    }]);

    expect(merged.references).toHaveLength(2);
  });

  it("fails closed before merging trusted metadata when stable identities conflict", () => {
    const canonical = {
      id: "stored",
      title: "Cached title",
      authors: ["Canonical Author"],
      doi: "10.1000/shared",
      url: "https://publisher.example/paper-a",
      metadataProvenance: [{ kind: "cached", source: "cache", fields: ["title", "authors"] }],
    };
    const merged = mergeReferenceMetadata(canonical, {
      id: "incoming",
      title: "Inspected title",
      authors: ["Incoming Author"],
      doi: "https://doi.org/10.1000/shared",
      url: "https://publisher.example/paper-b",
      metadataProvenance: [{ kind: "inspected", source: "review", fields: ["title", "authors"] }],
    }, { allowTrustedScalarOverride: true });

    expect(merged).toEqual(canonical);
  });

  it("initializes an empty canonical reference and enriches compatible aliases", () => {
    const initialized = mergeReferenceMetadata({}, {
      id: "incoming",
      title: "Article title",
      authors: ["Author One"],
      doi: "https://doi.org/10.1000/shared",
    });
    expect(initialized).toMatchObject({
      id: "incoming",
      title: "Article title",
      authors: ["Author One"],
      doi: "https://doi.org/10.1000/shared",
    });

    const enriched = mergeReferenceMetadata({
      id: "stored",
      title: "Article title",
      authors: [],
      doi: "10.1000/shared",
    }, {
      id: "incoming",
      title: "Article title",
      authors: ["Author One"],
      doi: "https://doi.org/10.1000/shared",
      pmid: "19322953",
    });
    expect(enriched).toMatchObject({
      id: "stored",
      authors: ["Author One"],
      doi: "10.1000/shared",
      pmid: "19322953",
    });
  });

  it("does not trust self-declared provenance unless the caller opts in", () => {
    const canonical = {
      id: "stored",
      title: "Canonical title",
      authors: [],
      metadataProvenance: [{ kind: "cached", source: "cache", fields: ["title"] }],
    };
    const incoming = {
      id: "incoming",
      title: "Claimed inspected title",
      authors: [],
      metadataProvenance: [{ kind: "inspected", source: "client", fields: ["title"] }],
    };

    expect(mergeReferenceMetadata(canonical, incoming).title).toBe("Canonical title");
    expect(mergeReferenceMetadata(
      canonical,
      incoming,
      { allowTrustedScalarOverride: true },
    ).title).toBe("Claimed inspected title");
  });

  it("supports replacement collections while enriching compatible incoming aliases", () => {
    const merged = mergeReferenceCollections([{
      id: "stored-kept",
      title: "Rich title",
      authors: ["Author"],
      pmid: "19322953",
    }, {
      id: "stored-omitted",
      title: "Delete me",
      authors: ["Other"],
      pmid: "99999",
    }], [{
      id: "incoming-alias",
      title: "Rich title",
      authors: [],
      pmid: "19322953",
      doi: "10.1055/s-0028-1109182",
    }], { retainExistingUnmatched: false });

    expect(merged.references).toEqual([expect.objectContaining({
      id: "stored-kept",
      authors: ["Author"],
      doi: "10.1055/s-0028-1109182",
    })]);
    expect(merged.remap.get("incoming-alias")).toBe("stored-kept");
  });
});
