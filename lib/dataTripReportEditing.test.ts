import { describe, expect, it } from "vitest";
import {
  editableSnapshotOf,
  editableSnapshotsAgree,
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
