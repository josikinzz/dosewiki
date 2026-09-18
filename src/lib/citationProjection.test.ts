import { describe, expect, it } from "vitest";
import {
  getEffectReferenceTarget,
  projectEffectCitations,
  projectSubstanceCitations,
} from "./citationProjection";

describe("citation projection", () => {
  it("projects substance sources and further reading with labels, deduped URLs, and collapsed counts", () => {
    const projection = projectSubstanceCitations({
      sourceCitations: [
        { name: "PsychonautWiki", url: "https://psychonautwiki.org/wiki/Ketamine/" },
        { name: "", url: "https://erowid.org/chemicals/ketamine/" },
      ],
      citations: [
        { name: "Further A", url: "https://example.com/a/" },
        { name: "Further A duplicate", url: "https://example.com/a" },
        { name: "", url: "https://example.com/b" },
        { name: "Further C", url: "https://example.com/c" },
        { name: "Further D", url: "https://example.com/d" },
        { name: "No URL", url: "" },
      ],
    });

    expect(projection.primarySources.items).toMatchObject([
      { role: "primary-source", label: "PsychonautWiki", number: 1, anchorId: "cite-1" },
      { role: "primary-source", label: "Source 2", number: 2, anchorId: "cite-2" },
    ]);
    expect(projection.furtherReading.items.map((item) => item.label)).toEqual([
      "Further A",
      "Citation 3",
      "Further C",
      "Further D",
      "No URL",
    ]);
    expect(projection.furtherReading.visibleItems).toHaveLength(3);
    expect(projection.furtherReading.collapsedCount).toBe(2);
  });

  it("omits completely blank legacy citation rows", () => {
    const projection = projectSubstanceCitations({
      sourceCitations: [{ name: "", url: "" }],
      citations: [{ name: "", url: "" }],
    });

    expect(projection.primarySources.items).toEqual([]);
    expect(projection.furtherReading.items).toEqual([]);
  });

  it("projects structured references in first-appearance order before legacy source pages", () => {
    const projection = projectSubstanceCitations({
      article: {
        summary: "First claim [cite:source-b]. Second claim [cite:source-a][cite:source-b].",
      },
      references: [
        { id: "source-a", type: "webpage", title: "Source A", authors: [], url: "https://example.com/a", sourceType: "unknown", quality: "fallback" },
        { id: "source-b", type: "webpage", title: "Source B", authors: [], url: "https://example.com/b", sourceType: "unknown", quality: "fallback" },
      ],
      sourceCitations: [{ name: "Aggregator", url: "https://example.com/source-page" }],
      citations: [{ name: "Further", url: "https://example.com/further" }],
      expandedReferences: true,
    });

    expect(projection.references.items).toMatchObject([
      { role: "reference", referenceId: "source-b", number: 1, anchorId: "ref-source-b" },
      { role: "reference", referenceId: "source-a", number: 2, anchorId: "ref-source-a" },
    ]);
    expect(projection.primarySources.items[0]).toMatchObject({ label: "Aggregator" });
    expect(projection.furtherReading.items[0]).toMatchObject({ label: "Further" });
  });

  it("treats legacy source lists as fallback leftovers once structured references exist", () => {
    const projection = projectSubstanceCitations({
      article: {
        summary: "Supported [cite:source-a].",
      },
      references: [
        { id: "source-a", type: "webpage", title: "Source A", authors: [], url: "https://example.com/a", sourceType: "unknown", quality: "fallback" },
      ],
      sourceCitations: [
        { name: "Duplicate source", url: "https://example.com/a/" },
        { name: "Unmatched source", url: "https://example.com/source-page" },
      ],
      citations: [
        { name: "Duplicate further reading", url: "https://example.com/a/" },
        { name: "Further", url: "https://example.com/further" },
      ],
      expandedReferences: true,
    });

    expect(projection.references.items).toHaveLength(1);
    expect(projection.primarySources.items).toMatchObject([
      { label: "Unmatched source" },
    ]);
    expect(projection.furtherReading.items).toMatchObject([
      { label: "Further" },
    ]);
  });

  it("includes dosage and duration route reference_ids in numbered references", () => {
    const projection = projectSubstanceCitations({
      article: {
        dosage: {
          routes: [
            {
              route: "oral",
              reference_ids: ["dosage-ref"],
              dose_ranges: {},
              notes: "",
              bioavailability: "",
              bioavailability_notes: "",
            },
          ],
        },
        duration: {
          routes: [
            {
              route: "oral",
              reference_ids: ["duration-ref"],
              stages: {},
              half_life: "",
              half_life_notes: "",
            },
          ],
        },
      },
      references: [
        { id: "dosage-ref", type: "webpage", title: "Dosage Source", authors: [], url: "https://example.com/dosage", sourceType: "unknown", quality: "fallback" },
        { id: "duration-ref", type: "webpage", title: "Duration Source", authors: [], url: "https://example.com/duration", sourceType: "unknown", quality: "fallback" },
      ],
      expandedReferences: true,
    });

    expect(projection.references.items).toMatchObject([
      { referenceId: "dosage-ref", number: 1 },
      { referenceId: "duration-ref", number: 2 },
    ]);
  });

  it("projects effect see-also, external links, and references with stable anchors", () => {
    const projection = projectEffectCitations({
      seeAlso: [{ title: "Geometry", location: "/effects/geometry" }],
      externalLinks: [
        { title: "EffectIndex", url: "https://effectindex.com/" },
        { title: "EffectIndex duplicate", url: "https://effectindex.com" },
      ],
      citations: [
        { text: "Paper one", url: "https://example.com/paper-1", from: "paper-one" },
        { text: "", url: "https://example.com/paper-2" },
      ],
      expandedReferences: true,
    });

    expect(projection.internalRelatedLinks.items[0]).toMatchObject({
      role: "internal-link",
      label: "Geometry",
      url: "/effects/geometry",
    });
    expect(projection.externalLinks.items).toHaveLength(1);
    expect(projection.references.items).toMatchObject([
      { role: "reference", label: "Paper one", anchorId: "cite-paper-one", from: "paper-one" },
      { role: "reference", label: "Reference 2", anchorId: "cite-2" },
    ]);
  });

  it("canonicalizes legacy effect links and rejects misplaced source citations", () => {
    const projection = projectEffectCitations({
      seeAlso: [
        { title: "Stimulation", location: "/effectsStimulation" },
        { title: "Increased pareidolia", location: "/effects/Increased pareidolia" },
        {
          title: "Nefazodone study",
          location:
            "/effects/Schwartz, K. (1997). Nefazodone and visual side effects.",
        },
      ],
    });

    expect(projection.internalRelatedLinks.items.map((item) => item.url)).toEqual([
      "/effects/stimulation",
      "/effects/increased-pareidolia",
    ]);
  });

  it("renders malformed legacy citation locators as unlinked labels", () => {
    const projection = projectSubstanceCitations({
      citations: [{ name: "Legacy book reference", url: "ISBN 9780853697114" }],
    });

    expect(projection.furtherReading.items[0]).toMatchObject({
      label: "Legacy book reference",
      url: "",
    });
  });

  it("returns VCode reference targets from the same projected anchors", () => {
    expect(
      getEffectReferenceTarget("source-a", [
        { text: "Source A", url: "https://example.com/a", from: "source-a" },
      ]),
    ).toEqual({
      anchorId: "cite-source-a",
      number: 1,
      label: "Source A",
    });

    expect(getEffectReferenceTarget("7", [])).toEqual({
      anchorId: "cite-7",
      number: 7,
      label: "Reference 7",
    });
  });
});
