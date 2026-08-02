import { describe, expect, it } from "vitest";
import { normalizeNotesText, planDoseUnitEdits } from "./normalize-dose-units";

const range = (unit: string) => ({ min: 1, max: 2, unit });

describe("planDoseUnitEdits", () => {
  it("targets only ug/mcg unit fields and rewrites them to the micro sign", () => {
    const edits = planDoseUnitEdits([
      {
        slug: "1b-lsd",
        dosage: {
          routes: [
            {
              route: "oral",
              dose_ranges: {
                threshold: range("ug"),
                light: range("UG "),
                moderate: range("mcg"),
                strong: range("µg"),
                heavy: range("mg"),
              },
              notes: "",
            },
          ],
        },
      },
    ]);
    expect(edits.map((edit) => [edit.path, edit.after])).toEqual([
      ["dosage.routes.0.dose_ranges.threshold", "µg"],
      ["dosage.routes.0.dose_ranges.light", "µg"],
      ["dosage.routes.0.dose_ranges.moderate", "µg"],
    ]);
    expect(edits.every((edit) => edit.kind === "unit")).toBe(true);
  });

  it("keeps the rest of the range object intact in the expected value", () => {
    const stored = { min: 50, max: 150, unit: "ug" };
    const edits = planDoseUnitEdits([
      { slug: "al-lad", dosage: { routes: [{ dose_ranges: { light: stored }, notes: "" }] } },
    ]);
    expect(edits[0]?.expected).toBe(stored);
  });

  it("rewrites number-anchored tokens in route notes and nothing else", () => {
    const edits = planDoseUnitEdits([
      {
        slug: "25c-nbome",
        dosage: {
          routes: [
            { dose_ranges: {}, notes: "documented at 4 mg (4000 ug). This drug is potent; 100-200ug reported." },
          ],
        },
      },
    ]);
    expect(edits).toHaveLength(1);
    expect(edits[0]?.kind).toBe("notes");
    expect(edits[0]?.after).toBe("documented at 4 mg (4000 µg). This drug is potent; 100-200 µg reported.");
  });

  it("returns nothing for clean articles", () => {
    expect(
      planDoseUnitEdits([
        { slug: "clean", dosage: { routes: [{ dose_ranges: { light: range("µg"), heavy: range("mg") }, notes: "a drug of note" }] } },
        { slug: "no-dosage" },
      ]),
    ).toEqual([]);
  });
});

describe("normalizeNotesText", () => {
  it("never touches words containing ug", () => {
    const text = "drugs, jugs, and plugs stay; 10ug and 25 mcg change";
    expect(normalizeNotesText(text)).toBe("drugs, jugs, and plugs stay; 10 µg and 25 µg change");
  });
});
