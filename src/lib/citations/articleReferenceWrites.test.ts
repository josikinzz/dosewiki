import { describe, expect, it } from "vitest";
import {
  normalizeIncomingReference,
  removeArticleReference,
} from "../../../server/lib/articleReferenceWrites";

const validReference = {
  id: "doi-10-2147-sar-s36761",
  type: "journal_article" as const,
  title: "Antitussives and substance abuse",
  authors: ["Edward Boyer", "Jarrett Burns"],
  doi: "10.2147/sar.s36761",
  url: "https://doi.org/10.2147/sar.s36761",
  sourceType: "primary_literature" as const,
  quality: "high" as const,
};

describe("article reference writes", () => {
  it("rejects raw MediaWiki markup in public bibliographic fields", () => {
    expect(normalizeIncomingReference({
      ...validReference,
      title: '<ref name="pmid24648790" /> [[NMDA receptor]]',
    })).toEqual({
      ok: false,
      reason: "Source titles and citation text cannot contain raw MediaWiki or <ref> markup.",
    });

    expect(normalizeIncomingReference({
      ...validReference,
      apaText: "{{cite journal|title=Antitussives and substance abuse}}",
    })).toEqual({
      ok: false,
      reason: "Source titles and citation text cannot contain raw MediaWiki or <ref> markup.",
    });
  });
});

describe("removeArticleReference", () => {
  const references = [
    { id: "doi-10-2147-sar-s36761", title: "Antitussives and substance abuse" },
    { id: "pmid-24648790", title: "NMDA receptor antagonists" },
  ];

  const citedDocument = () => ({
    title: "Dextromethorphan",
    references: references.map((reference) => ({ ...reference })),
    summary: "A dissociative cough suppressant [cite:doi-10-2147-sar-s36761] with a long history.",
    interactions: {
      sections: [
        {
          heading: "Serotonergic drugs",
          body: "Risk of serotonin syndrome [cite:doi-10-2147-sar-s36761], notably with MAOIs.",
        },
      ],
    },
    dosage: {
      notes: "Threshold doses cluster low [cite:doi-10-2147-sar-s36761].",
      routes: [
        { route: "oral", reference_ids: ["doi-10-2147-sar-s36761", "pmid-24648790"] },
        { route: "insufflated", reference_ids: ["doi-10-2147-sar-s36761"] },
      ],
    },
    duration: {
      routes: [
        { route: "oral", reference_ids: ["pmid-24648790", "doi-10-2147-sar-s36761"] },
      ],
    },
  });

  it("removes a cited reference, stripping markers from nested prose and route ids", () => {
    const document = citedDocument();
    const result = removeArticleReference(document, "doi-10-2147-sar-s36761");
    expect(result).toMatchObject({
      ok: true,
      removed: true,
      title: "Antitussives and substance abuse",
      markersStripped: 3,
      routeIdsStripped: 3,
    });
    if (result.ok !== true || result.removed !== true) throw new Error("unreachable");

    expect(result.patch.references).toEqual([
      { id: "pmid-24648790", title: "NMDA receptor antagonists" },
    ]);
    expect(result.patch.summary).toBe("A dissociative cough suppressant with a long history.");
    expect(result.patch.interactions).toEqual({
      sections: [
        {
          heading: "Serotonergic drugs",
          body: "Risk of serotonin syndrome, notably with MAOIs.",
        },
      ],
    });
    expect(result.patch.dosage).toEqual({
      notes: "Threshold doses cluster low.",
      routes: [
        { route: "oral", reference_ids: ["pmid-24648790"] },
        { route: "insufflated", reference_ids: [] },
      ],
    });
    expect(result.patch.duration).toEqual({
      routes: [{ route: "oral", reference_ids: ["pmid-24648790"] }],
    });
    // Only changed top-level keys are patched.
    expect(result.patch.title).toBeUndefined();
  });

  it("cleans whitespace around removed markers", () => {
    const document = {
      references: [{ id: "src-1", title: "Source one" }],
      summary: " a [cite:src-1] b",
      pharmacology: "Binds NMDA receptors [cite:src-1], among others [cite:src-1].",
      onset: "[cite:src-1] Rapid onset",
    };
    const result = removeArticleReference(document, "src-1");
    expect(result).toMatchObject({ ok: true, removed: true, markersStripped: 4 });
    if (result.ok !== true || result.removed !== true) throw new Error("unreachable");
    expect(result.patch.summary).toBe("a b");
    expect(result.patch.pharmacology).toBe("Binds NMDA receptors, among others.");
    expect(result.patch.onset).toBe("Rapid onset");
  });

  it("removes an uncited reference with zero counts", () => {
    const document = {
      references: [
        { id: "src-1", title: "Source one" },
        { id: "src-2", title: "Source two" },
      ],
      summary: "Prose citing another source [cite:src-2].",
    };
    const result = removeArticleReference(document, "src-1");
    expect(result).toMatchObject({
      ok: true,
      removed: true,
      title: "Source one",
      markersStripped: 0,
      routeIdsStripped: 0,
    });
    if (result.ok !== true || result.removed !== true) throw new Error("unreachable");
    expect(result.patch).toEqual({
      references: [{ id: "src-2", title: "Source two" }],
    });
  });

  it("reports removed: false for an absent id and leaves the document untouched", () => {
    const document = citedDocument();
    const before = JSON.stringify(document);
    expect(removeArticleReference(document, "no-such-source")).toEqual({
      ok: true,
      removed: false,
    });
    expect(JSON.stringify(document)).toBe(before);
  });

  it("rejects an invalid reference id", () => {
    const result = removeArticleReference(citedDocument(), "not a valid id!");
    expect(result).toEqual({ ok: false, error: "That is not a usable citation id." });
  });
});
