import { describe, expect, it } from "vitest";
import {
  buildCitationNumbering,
  collectCitationIdsFromContent,
  collectCitationIdsFromPublicRenderOrder,
  deterministicReferenceId,
  renderCitationTokenText,
} from "./referenceModel";
import { deterministicReferenceId as sharedDeterministicReferenceId } from "../../../lib/citations/referenceIdentity.js";

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
});
