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

test("scoped rebase preserves selectedSections and reports dropped selected sections", () => {
  const draft = {
    citationMode: "marker_only",
    selectedSections: ["pharmacology"],
    markedSections: {
      pharmacology: "Keeps working.[cite:ref-a] This sentence was edited live.[cite:ref-b]",
    },
    evidence: [
      { status: "supported", fieldPath: "pharmacology", referenceIds: ["ref-a"] },
    ],
    references: [
      { id: "ref-a", title: "Reference A" },
      { id: "ref-b", title: "Reference B" },
    ],
    sources: [],
  };
  const article = { pharmacology: "Keeps working. This sentence was edited live on the site." };
  const { rebasedDraft, report } = rebaseWorkbenchDraft({ draft, article });
  assert.deepEqual(rebasedDraft.selectedSections, ["pharmacology"]);
  assert.equal(report.transplantedFieldCount, 0, "changed live string drops its markers as one field");
  assert.equal(report.droppedFieldCount, 1);
  assert.deepEqual(report.droppedSelectedSections, ["pharmacology"]);
  assert.deepEqual(report.selectedSections, ["pharmacology"]);
});

test("rebase merges draft markers with existing live markers", () => {
  const draft = {
    citationMode: "marker_only",
    selectedSections: ["pharmacology"],
    markedSections: {
      pharmacology: {
        mechanism: "First claim. Second claim.[cite:new-ref]",
      },
    },
    evidence: [{
      status: "supported",
      fieldPath: "pharmacology.mechanism",
      referenceIds: ["new-ref"],
    }],
    references: [{ id: "new-ref" }],
    sources: [],
  };
  const article = {
    pharmacology: {
      mechanism: "First claim.[cite:existing-a] Second claim.[cite:existing-b]",
    },
  };

  const { rebasedDraft, report } = rebaseWorkbenchDraft({ draft, article });

  assert.equal(
    rebasedDraft.markedSections.pharmacology.mechanism,
    "First claim.[cite:existing-a] Second claim.[cite:existing-b][cite:new-ref]",
  );
  assert.equal(report.preservedExistingMarkerCount, 2);
  assert.equal(report.transplantedMarkerCount, 1);
});

test("scoped rebase transplants unchanged selected fields and keeps live edits", () => {
  const draft = {
    citationMode: "marker_only",
    selectedSections: ["pharmacology"],
    markedSections: {
      pharmacology: {
        mechanism: { description: "Agonist at the target receptor.[cite:ref-a]" },
        metabolism: { description: "Hepatic.[cite:ref-b]" },
      },
    },
    evidence: [
      { status: "supported", fieldPath: "pharmacology.mechanism.description", referenceIds: ["ref-a"] },
    ],
    references: [
      { id: "ref-a", title: "Reference A" },
      { id: "ref-b", title: "Reference B" },
    ],
    sources: [],
  };
  const article = {
    pharmacology: {
      mechanism: { description: "Agonist at the target receptor." },
      metabolism: { description: "Edited by an editor." },
    },
  };
  const { rebasedDraft, report } = rebaseWorkbenchDraft({ draft, article });
  assert.equal(
    rebasedDraft.markedSections.pharmacology.mechanism.description,
    "Agonist at the target receptor.[cite:ref-a]",
  );
  assert.equal(
    rebasedDraft.markedSections.pharmacology.metabolism.description,
    "Edited by an editor.",
  );
  assert.deepEqual(report.droppedSelectedSections, ["pharmacology"]);
  assert.deepEqual(rebasedDraft.references.map((reference) => reference.id), ["ref-a"]);
});

test("scoped rebase rejects marked sections outside selectedSections", () => {
  const draft = {
    citationMode: "marker_only",
    selectedSections: ["pharmacology"],
    markedSections: {
      pharmacology: "Fine.[cite:ref-a]",
      summary: "Rogue section output.[cite:ref-a]",
    },
    evidence: [],
    references: [{ id: "ref-a", title: "Reference A" }],
    sources: [],
  };
  const article = { pharmacology: "Fine.", summary: "Rogue section output." };
  assert.throws(
    () => rebaseWorkbenchDraft({ draft, article }),
    /not in selectedSections/,
  );
});
