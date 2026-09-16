import { describe, expect, it } from "vitest";
import {
  editableSnapshotOf,
  editableSnapshotsAgree,
  normalizeEditableFields,
  normalizeEditableTags,
  normalizeEditableTimeline,
  validateEditableFields,
  type TripReportEditableFields,
} from "../server/lib/tripReportEditing";

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
