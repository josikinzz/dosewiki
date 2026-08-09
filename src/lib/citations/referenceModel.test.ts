import { describe, expect, it } from "vitest";
import {
  buildCitationNumbering,
  collectCitationIdsFromContent,
  collectCitationIdsFromPublicRenderOrder,
  dedupeReferences,
  deterministicReferenceId,
  formatApaReference,
  formatWikipediaStyleReference,
  renderCitationTokenText,
} from "./referenceModel";
import { deterministicReferenceId as sharedDeterministicReferenceId } from "../../../lib/citations/referenceIdentity.mjs";

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

  it("uses the shared stable-id contract for runtime numbering helpers", () => {
    const reference = {
      url: "https://pubmed.ncbi.nlm.nih.gov/12345/",
      siteName: "PubMed",
      title: "Paper",
    };

    expect(deterministicReferenceId(reference)).toBe(sharedDeterministicReferenceId(reference));
  });

  it("deduplicates references by normalized title when stronger identifiers are unavailable", () => {
    expect(dedupeReferences([
      { id: "worker-a", type: "webpage", title: "Controlled substances list", authors: [], sourceType: "unknown", quality: "fallback" },
      { id: "worker-b", type: "webpage", title: "Controlled Substances List", authors: [], sourceType: "unknown", quality: "fallback" },
    ])).toHaveLength(1);
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
    expect(formatApaReference({ ...authored, apaText: "  Curated reference text.  " })).toBe(
      "Curated reference text.",
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
