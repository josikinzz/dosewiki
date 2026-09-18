import { describe, expect, it } from "vitest";
import type { SubstanceArticle } from "@/schema";
import {
  buildCitationNumbering,
  collectCitationIdsFromContent,
  collectCitationIdsFromPublicRenderOrder,
  dedupeReferences,
  deterministicReferenceId,
  formatApaReference,
  getReferenceDisplayTitle,
  formatWikipediaStyleReference,
  getArticleCitationModel,
  renderCitationTokenText,
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

  it("keeps numbering stable across fragments but updates an edited preview revision", () => {
    const article = {
      summary: "First [cite:b], then [cite:a].",
      references: [
        { id: "a", type: "webpage", title: "A", authors: [], url: "https://example.com/a" },
        { id: "b", type: "webpage", title: "B", authors: [], url: "https://example.com/b" },
      ],
    } as SubstanceArticle;
    const original = getArticleCitationModel(article);
    expect(renderCitationTokenText("Expanded [cite:a].", getArticleCitationModel(article))).toBe("Expanded [2].");
    const edited = getArticleCitationModel({
      ...article,
      summary: "First [cite:a], then [cite:b].",
      references: article.references?.map((reference) => reference.id === "a" ? { ...reference, title: "Edited A" } : reference),
    });
    expect(edited.numberedReferencesById.get("a")).toMatchObject({ number: 1, title: "Edited A", anchorId: "ref-a" });
    expect(original.numberedReferencesById.get("a")).toMatchObject({ number: 2, title: "A", anchorId: "ref-a" });
  });

  it("collects public citation order across pilot sections and structured route references", () => {
    expect(collectCitationIdsFromPublicRenderOrder({
      summary: "Overview [cite:summary-ref].",
      dosage: {
        plateau_dosing: {
          notes: "",
        },
        routes: [
          {
            route: "oral",
            reference_ids: ["dosage-ref"],
            bioavailability: "",
            bioavailability_notes: "",
            notes: "",
          },
        ],
      },
      duration: {
        routes: [
          {
            route: "oral",
            reference_ids: ["duration-ref"],
            half_life: "",
            half_life_notes: "",
          },
        ],
      },
      pharmacology: {
        pharmacodynamics: "Pharmacology [cite:pharm-ref].",
        pharmacokinetics: "Kinetics [cite:kinetics-ref].",
      },
      tolerance: {
        full_tolerance: "Tolerance [cite:tolerance-ref].",
        half_tolerance: "",
        baseline_tolerance: "",
        cross_tolerance: [],
      },
      harm_potential: {
        summary: "Harm [cite:harm-ref].",
      },
      history_culture: {
        content: "History [cite:history-ref].",
        sections: [],
      },
      legality: {
        international: [],
        countries: {
          US: {
            status: "",
            notes: "Legal note [cite:legal-ref].",
          },
        },
      },
    })).toEqual([
      "summary-ref",
      "dosage-ref",
      "duration-ref",
      "pharm-ref",
      "kinetics-ref",
      "tolerance-ref",
      "harm-ref",
      "history-ref",
      "legal-ref",
    ]);
  });

  it("renders stored stable tokens as display numbers", () => {
    const numbering = buildCitationNumbering([
      { id: "a", type: "webpage", title: "A", authors: [], url: "https://example.com/a", sourceType: "unknown", quality: "fallback" },
    ], { summary: "Claim [cite:a] and gap [cite:x]." });

    expect(renderCitationTokenText("Claim [cite:a] and gap [cite:x].", numbering)).toBe("Claim [1] and gap [?].");
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

  it("formats authorless dated APA references with the title before source and date", () => {
    expect(formatApaReference({
      id: "pmid-19322953",
      type: "journal_article",
      title: "The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor",
      authors: [],
      date: "February 2009",
      containerTitle: "Die Pharmazie",
      volume: "64",
      issue: "2",
      pages: "123–125",
      pmid: "19322953",
      url: "https://pubmed.ncbi.nlm.nih.gov/19322953/",
      sourceType: "primary_literature",
      quality: "high",
    })).toBe(
      "The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor. Die Pharmazie, 64(2), 123–125 (February 2009). https://pubmed.ncbi.nlm.nih.gov/19322953/",
    );
  });

  it("replaces raw MediaWiki reference markup with a stable identifier label", () => {
    const reference = {
      id: "doi-10-2147-sar-s36761",
      type: "unknown" as const,
      title: '<ref name="pmid24648790" /> * [[Uncompetitive inhibitor|Uncompetitive antagonist]] of the [[NMDA receptor]] via the {{abbrlink|PCP|phencyclidine}} site<ref n',
      authors: [],
      doi: "10.2147/SAR.S36761",
      pmid: "24648790",
      url: "https://doi.org/10.2147/SAR.S36761",
      sourceType: "unknown" as const,
      quality: "fallback" as const,
    };

    expect(getReferenceDisplayTitle(reference)).toBe("DOI 10.2147/sar.s36761");
    expect(formatApaReference(reference)).toBe(
      "DOI 10.2147/sar.s36761. (n.d.). https://doi.org/10.2147/sar.s36761",
    );
    expect(formatWikipediaStyleReference(reference)).toBe(
      '"DOI 10.2147/sar.s36761". doi:10.2147/sar.s36761.',
    );
  });

  it("neutralizes date-first stored APA text for authorless references", () => {
    const authorless = {
      id: "pmid-19322953",
      type: "journal_article" as const,
      title: "The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor",
      authors: [],
      date: "February 2009",
      containerTitle: "Die Pharmazie",
      volume: "64",
      issue: "2",
      pages: "123–125",
      pmid: "19322953",
      sourceType: "primary_literature" as const,
      quality: "high" as const,
    };
    const fallback = "The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor. Die Pharmazie, 64(2), 123–125 (February 2009).";

    expect(formatApaReference({
      ...authorless,
      apaText: "  (February 2009). Broken date-first reference.  ",
    })).toBe(fallback);
    expect(formatApaReference({
      ...authorless,
      apaText: "  Curated title-first reference (February 2009).  ",
    })).toBe("Curated title-first reference (February 2009).");

    const numbering = buildCitationNumbering([{
      ...authorless,
      apaText: "  (February 2009). Broken date-first reference.  ",
    }], { summary: "Finding [cite:pmid-19322953]." });
    expect(numbering.numberedReferences[0]?.apaTextResolved).toBe(fallback);
    expect(numbering.numberedReferences[0]?.referenceTextResolved).toBe(
      '"The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor". Die Pharmazie (February 2009). 64 (2): 123–125. PMID 19322953.',
    );
  });

  it("preserves authored APA ordering and explicit APA text", () => {
    const authored = {
      id: "paper",
      type: "journal_article" as const,
      title: "Example paper",
      authors: ["Author A", "Author B"],
      year: 2024,
      containerTitle: "Example Journal",
      volume: "12",
      issue: "3",
      pages: "10–20",
      sourceType: "primary_literature" as const,
      quality: "high" as const,
    };

    expect(formatApaReference(authored)).toBe(
      "Author A, & Author B. (2024). Example paper. Example Journal, 12(3), 10–20.",
    );
    expect(formatApaReference({ ...authored, apaText: "  (2024). Curated reference text.  " })).toBe(
      "(2024). Curated reference text.",
    );
  });

  it("formats authorless dated Wikipedia-style references with title and source before the date", () => {
    const reference = {
      id: "pmid-19322953",
      type: "journal_article" as const,
      title: "The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor",
      authors: [],
      date: "February 2009",
      containerTitle: "Die Pharmazie",
      volume: "64",
      issue: "2",
      pages: "123–125",
      pmid: "19322953",
      sourceType: "primary_literature" as const,
      quality: "high" as const,
    };

    expect(formatWikipediaStyleReference(reference)).toBe(
      '"The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor". Die Pharmazie (February 2009). 64 (2): 123–125. PMID 19322953.',
    );

    const numbering = buildCitationNumbering([reference], {
      summary: "Finding [cite:pmid-19322953].",
    });
    expect(numbering.numberedReferences[0]?.referenceTextResolved).toBe(
      '"The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor". Die Pharmazie (February 2009). 64 (2): 123–125. PMID 19322953.',
    );
  });

  it("formats Wikipedia-style reference details without requiring APA as canonical text", () => {
    expect(formatWikipediaStyleReference({
      id: "paper",
      type: "journal_article",
      title: "Acute pharmacological effects of 2C-B in humans",
      authors: ["Author A", "Author B"],
      year: 2018,
      containerTitle: "Journal of Psychopharmacology",
      volume: "32",
      issue: "5",
      pages: "512-522",
      doi: "10.1000/example",
      sourceType: "primary_literature",
      quality: "high",
    })).toBe("Author A; Author B (2018). \"Acute pharmacological effects of 2C-B in humans\". Journal of Psychopharmacology. 32 (5): 512-522. doi:10.1000/example.");

    expect(formatWikipediaStyleReference({
      id: "web",
      type: "webpage",
      title: "Controlled substances list",
      authors: [],
      siteName: "Government Example",
      publisher: "Government Example",
      url: "https://example.gov/controlled",
      accessedAt: "2026-05-31",
      sourceType: "government_or_regulatory",
      quality: "high",
    })).toBe("\"Controlled substances list\". Government Example. Retrieved 2026-05-31.");
  });
});
