import { describe, expect, it } from "vitest";

import { ARTICLE_SECTION_LABELS } from "./ArticleSectionForm";
import { CHANGE_NOTE_MAX_LENGTH, synthesizeChangeNote } from "./changeNote";

const DOSAGE = ARTICLE_SECTION_LABELS.dosage;

describe("synthesizeChangeNote", () => {
  it("names what a citation did and where, in the changelog's words", () => {
    expect(synthesizeChangeNote([{
      path: "dosage.routes[0].notes",
      before: "Occurs in users and more.",
      after: "Occurs in users[cite:doi-1] and more.",
    }])).toBe(`Added a citation in ${DOSAGE} › Routes 1 › Notes`);
  });

  it("reads a flag answered by a citation as sourcing the claim", () => {
    expect(synthesizeChangeNote([{
      path: "summary",
      before: "Risky at high doses[citation-needed].",
      after: "Risky at high doses[cite:doi-1].",
    }])).toBe(`Sourced a claim in ${ARTICLE_SECTION_LABELS.summary}`);
  });

  it("names an added source by its title", () => {
    expect(synthesizeChangeNote([{
      path: "references[doi-1]",
      before: undefined,
      after: { id: "doi-1", title: "A paper about receptors" },
    }])).toBe("Added the source A paper about receptors");
  });

  it("reports a removed source without inventing a title for it", () => {
    expect(synthesizeChangeNote([{
      path: "references[doi-1]",
      before: { id: "doi-1", title: "" },
      after: undefined,
    }])).toBe("Removed a source");
  });

  it("joins two changes and counts the rest beyond them", () => {
    const changes = [
      { path: "summary", before: "One.", after: "Two." },
      { path: "tolerance.full_tolerance", before: "a", after: "b" },
      { path: "legality.notes", before: "c", after: "d" },
      { path: "history_culture.sections[0].body", before: "e", after: "f" },
    ];

    expect(synthesizeChangeNote(changes)).toBe(
      `Changed a word in ${ARTICLE_SECTION_LABELS.summary}, changed a word in ${ARTICLE_SECTION_LABELS.tolerance} › Full tolerance and changed 2 more fields`,
    );
  });

  it("describes a field that gained or lost a value without diffing prose", () => {
    expect(synthesizeChangeNote([{
      path: "dosage.routes[0].dose_ranges.heavy",
      before: null,
      after: { min: 20, max: 40, unit: "mg" },
    }])).toBe(`Filled in ${DOSAGE} › Routes 1 › Dose ranges › Heavy`);
  });

  it("says nothing when nothing changed, because nothing can be published", () => {
    expect(synthesizeChangeNote([])).toBe("");
  });

  it("stays inside the write layer's cap and never cuts mid-word", () => {
    // A long title is the one input that reaches the note verbatim; a prose
    // diff is always summarized into a count.
    const note = synthesizeChangeNote([{
      path: "references[doi-1]",
      before: undefined,
      after: { id: "doi-1", title: `${"Receptor ".repeat(80)}review` },
    }]);

    expect(note.length).toBeLessThanOrEqual(CHANGE_NOTE_MAX_LENGTH);
    expect(note.endsWith("…")).toBe(true);
    expect(note).not.toMatch(/Recep…$/);
  });
});
