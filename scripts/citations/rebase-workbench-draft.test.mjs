import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFieldPath, parsePath, rebaseWorkbenchDraft } from "./rebase-workbench-draft.mjs";

const baseDraft = () => ({
  citationMode: "marker_only",
  markedSections: {
    summary: "A drug.[cite:ref-a] It is old.[cite:ref-b]",
    harm_potential: {
      addiction: { description: "Not habit forming.[cite:ref-a]" },
      psychosis: { description: "Psychosis reported.[cite:ref-c]" },
    },
  },
  evidence: [
    { status: "supported", fieldPath: "summary", referenceIds: ["ref-a", "ref-b"] },
    { status: "supported", fieldPath: "harm_potential.addiction.description", referenceIds: ["ref-a"] },
    { status: "supported", fieldPath: "harm_potential.psychosis.description", referenceIds: ["ref-c"] },
    { status: "needs_review", fieldPath: "harm_potential.psychosis.description", referenceIds: ["ref-d"] },
  ],
  references: [{ id: "ref-a" }, { id: "ref-b" }, { id: "ref-c" }, { id: "ref-unused" }],
  sources: [
    { id: "s1", referenceId: "ref-a", excerpt: "x" },
    { id: "s3", referenceId: "ref-c", excerpt: "y" },
  ],
  articlePatches: [],
});

const liveArticle = () => ({
  summary: "A drug. It is old.",
  harm_potential: {
    addiction: { description: "Not habit forming." },
    psychosis: { description: "Psychosis was rewritten by an editor." },
    seizure: { description: "New field added by schema migration." },
  },
});

test("parsePath handles dots and array indices", () => {
  assert.deepEqual(parsePath("sections[2].content"), ["sections", 2, "content"]);
  assert.deepEqual(parsePath("countries.Canada.notes"), ["countries", "Canada", "notes"]);
});

test("normalizeFieldPath converts dotted indices to brackets", () => {
  assert.equal(normalizeFieldPath("history_culture.sections.0.content"), "history_culture.sections[0].content");
  assert.equal(normalizeFieldPath("history_culture.sections[1].content"), "history_culture.sections[1].content");
});

test("rebase transplants unchanged fields, drops changed ones, prunes evidence and references", () => {
  const { rebasedDraft, report } = rebaseWorkbenchDraft({ draft: baseDraft(), article: liveArticle() });

  assert.equal(rebasedDraft.markedSections.summary, "A drug.[cite:ref-a] It is old.[cite:ref-b]");
  assert.equal(
    rebasedDraft.markedSections.harm_potential.addiction.description,
    "Not habit forming.[cite:ref-a]",
  );
  assert.equal(
    rebasedDraft.markedSections.harm_potential.psychosis.description,
    "Psychosis was rewritten by an editor.",
  );
  assert.equal(
    rebasedDraft.markedSections.harm_potential.seizure.description,
    "New field added by schema migration.",
  );

  assert.equal(report.transplantedFieldCount, 2);
  assert.equal(report.transplantedMarkerCount, 3);
  assert.equal(report.droppedFieldCount, 1);
  assert.deepEqual(report.dropped[0].markerIds, ["ref-c"]);
  assert.equal(report.dropped[0].reason, "live_text_changed");

  const supportedPaths = rebasedDraft.evidence.filter((row) => row.status === "supported").map((row) => row.fieldPath);
  assert.deepEqual(supportedPaths.sort(), ["harm_potential.addiction.description", "summary"]);
  assert.equal(rebasedDraft.evidence.some((row) => row.status === "needs_review"), true);

  assert.deepEqual(rebasedDraft.references.map((reference) => reference.id).sort(), ["ref-a", "ref-b"]);
  assert.deepEqual(rebasedDraft.sources.map((source) => source.id), ["s1"]);
});

test("rebase drops a whole section when every marked field changed", () => {
  const draft = baseDraft();
  draft.markedSections = { summary: draft.markedSections.summary, tolerance: { summary: "Old text.[cite:ref-a]" } };
  const article = { summary: "A drug. It is old.", tolerance: { summary: "Completely new tolerance text." } };
  const { rebasedDraft, report } = rebaseWorkbenchDraft({ draft, article });
  assert.equal("tolerance" in rebasedDraft.markedSections, false);
  assert.deepEqual(report.skippedSections, [{ sectionKey: "tolerance", reason: "all_markers_dropped" }]);
});
