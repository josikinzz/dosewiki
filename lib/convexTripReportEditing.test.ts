import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
  editableSnapshotOf,
  editableSnapshotsAgree,
  normalizeEditableFields,
  normalizeEditableTags,
  normalizeEditableTimeline,
  validateEditableFields,
  type TripReportEditableFields,
} from "../convex/lib/tripReportEditing";

const readSource = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");

const storedRow = {
  slug: "went-as-predicted",
  title: "Went as predicted",
  subject: {
    name: "coldbrew_kitten",
    profile_key: "COLDBREW",
    avatar_url: "https://cdn.example/face.png",
    trip_date: "2025-03-04",
    setting: "Home",
    age: "",
  },
  substances: [{ name: "Methamphetamine", dose: "20 mg", roa: "Oral" }],
  introduction: "  A short preamble.  ",
  onset: [{ time: "T+0:20", description: "First alert." }],
  peak: [],
  offset: [{ time: "", description: "Coming down." }],
  conclusion: "",
  tags: ["stimulant", "Stimulant", " focus "],
};

describe("trip report editable field normalization", () => {
  it("keeps only the editable slice of a stored row", () => {
    const snapshot = editableSnapshotOf(storedRow);

    // slug, profile_key and avatar_url are not editable fields, so they must
    // not appear in the snapshot the editor round-trips.
    expect(snapshot).toEqual({
      title: "Went as predicted",
      subject: { name: "coldbrew_kitten", trip_date: "2025-03-04", setting: "Home" },
      substances: [{ name: "Methamphetamine", dose: "20 mg", roa: "Oral" }],
      introduction: "A short preamble.",
      onset: [{ time: "T+0:20", description: "First alert." }],
      peak: [],
      offset: [{ description: "Coming down." }],
      tags: ["stimulant", "focus"],
    });
    expect("slug" in snapshot).toBe(false);
    expect("profile_key" in snapshot.subject).toBe(false);
    expect("conclusion" in snapshot).toBe(false);
  });

  it("collapses a cleared optional field to an absent key rather than an empty string", () => {
    const normalized = normalizeEditableFields({ ...storedRow, introduction: "   " });

    expect("introduction" in normalized).toBe(false);
  });

  it("drops the blank rows the form's add affordances leave behind", () => {
    const normalized = normalizeEditableFields({
      ...storedRow,
      substances: [{ name: "LSD", dose: "100 ug" }, { name: "   ", dose: "" }],
      onset: [{ time: "T+0:00", description: "  " }, { time: "", description: "Real entry." }],
    });

    expect(normalized.substances).toEqual([{ name: "LSD", dose: "100 ug" }]);
    expect(normalized.onset).toEqual([{ description: "Real entry." }]);
  });

  it("de-duplicates tags case-insensitively and keeps the first casing", () => {
    expect(normalizeEditableTags([" Focus ", "focus", "FOCUS", "", null])).toEqual(["Focus"]);
  });

  it("keeps timeline order, because reordering entries is itself an edit", () => {
    const entries = normalizeEditableTimeline([
      { time: "T+2:00", description: "Later." },
      { time: "T+0:10", description: "Earlier." },
    ]);

    expect(entries.map((entry) => entry.description)).toEqual(["Later.", "Earlier."]);
  });
});

describe("trip report save concurrency guard", () => {
  const base = editableSnapshotOf(storedRow);

  it("agrees with itself regardless of incidental whitespace in storage", () => {
    const noisy = editableSnapshotOf({
      ...storedRow,
      title: "  Went as predicted  ",
      tags: ["stimulant", " focus"],
    });

    expect(editableSnapshotsAgree(base, noisy)).toBe(true);
  });

  it("disagrees when any editable field moved", () => {
    const changes: TripReportEditableFields[] = [
      { ...base, title: "Went as predicted (v2)" },
      { ...base, subject: { ...base.subject, name: "nervewing" } },
      { ...base, tags: ["focus", "stimulant"] },
      { ...base, onset: [{ time: "T+0:20", description: "First alert!" }] },
      { ...base, substances: [] },
      { ...base, conclusion: "Added afterwards." },
    ];

    for (const changed of changes) {
      expect(editableSnapshotsAgree(base, changed)).toBe(false);
    }
  });
});

describe("trip report save validation", () => {
  const base = editableSnapshotOf(storedRow);

  it("accepts a report that has a title, a byline, a substance, and a body", () => {
    expect(validateEditableFields(base)).toEqual([]);
  });

  it("reports every blocking problem at once", () => {
    const problems = validateEditableFields(
      normalizeEditableFields({
        title: "",
        subject: { name: "  " },
        substances: [],
        onset: [],
        peak: [],
        offset: [],
        tags: [],
      }),
    );

    expect(problems).toEqual([
      "A report needs a title.",
      "A report needs a byline.",
      "A report needs at least one named substance.",
      "A report needs an introduction, a conclusion, or at least one timeline entry.",
    ]);
  });

  it("counts a conclusion alone as a body", () => {
    const conclusionOnly = normalizeEditableFields({
      ...storedRow,
      introduction: "",
      onset: [],
      peak: [],
      offset: [],
      conclusion: "That was that.",
    });

    expect(validateEditableFields(conclusionOnly)).toEqual([]);
  });
});

describe("Convex trip report update boundary", () => {
  const source = readSource("convex/tripReports.ts");

  it("gates the per-record write and the delete on editor role", () => {
    const editorGuards = source.match(/await requireEditorWrite\(ctx, \{/g) ?? [];

    // getPortalRows, getPortalRecord, update, deleteById.
    expect(editorGuards.length).toBe(4);
  });

  it("refuses a save whose snapshot no longer matches storage", () => {
    expect(source).toContain(
      "if (!editableSnapshotsAgree(editableSnapshotOf(row), normalizeEditableFields(args.expected))) {",
    );
    expect(source).toContain(
      "changed since it was opened; reload the portal before saving.",
    );
  });

  it("never lets a field edit rewrite the slug or the publication facts", () => {
    // The patch is built field by field from the editable slice; anything not
    // listed here keeps whatever the stored row had.
    const patchBlock = source.slice(
      source.indexOf("const patch: Parameters<typeof ctx.db.patch>[1] = {"),
      source.indexOf("// The marker records an editor's attribution decision"),
    );

    expect(patchBlock).toContain("title: updates.title,");
    expect(patchBlock).not.toContain("slug:");
    expect(patchBlock).not.toContain("featured:");
    expect(patchBlock).not.toContain("license:");
  });

  it("preserves editor-set subject links the portal does not surface", () => {
    expect(source).toContain("if (row.subject.avatar_url !== undefined) {");
    expect(source).toContain("if (row.subject.pdf_url !== undefined) {");
  });

  it("only adjudicates a byline that actually moved", () => {
    expect(source).toContain("if (bylineMoved) {");
    expect(source).toContain(
      "normalizeAuthorMatchName(updates.subject.name) !== normalizeAuthorMatchName(row.subject.name)",
    );
  });

  it("re-stamps the attribution decision only on a report that already carried one", () => {
    expect(source).toContain("if (row.attribution_review && attributionDecided) {");
    expect(source).toContain(
      'decision: assignedProfileKey ? ("assigned" as const) : ("declined" as const),',
    );
  });
});
