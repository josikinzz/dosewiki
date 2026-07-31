import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema";
import type { SubstanceArticle } from "@/schema";

import {
  applyInlineFieldEdits,
  asInlineFieldValue,
  inlineFieldValuesMatch,
  readStoredInlineValue,
} from "./inlineFieldEdits";

function articleWithRoutes(
  notes: string[],
  routes = ["oral", "insufflated", "smoked"],
): SubstanceArticle {
  const base = createEmptyArticle();
  return {
    ...base,
    dosage: {
      ...base.dosage,
      routes: notes.map((note, index) => ({
        route: routes[index],
        dose_ranges: {},
        notes: note,
      })),
    },
  } as unknown as SubstanceArticle;
}

const routeNotes = (article: SubstanceArticle): Array<string | undefined> =>
  article.dosage.routes.map((route) => route.notes);

describe("readStoredInlineValue", () => {
  it("reads the live value a conflict recovery should offer", () => {
    const live = articleWithRoutes(["Oral.", "Someone else's note."]);
    expect(
      readStoredInlineValue(live, "dosage.routes[1].notes", "Insufflated."),
    ).toBe("Someone else's note.");
  });

  it("reads an absent text leaf as the empty value it renders as", () => {
    const live = articleWithRoutes(["Oral."]);
    expect(readStoredInlineValue(live, "dosage.routes[0].notes", "Oral.")).toBe(
      "Oral.",
    );
    expect(
      readStoredInlineValue(live, "tolerance.full_tolerance", ""),
    ).toBe("");
  });

  it("answers null rather than substitute a value of the wrong kind", () => {
    const live = articleWithRoutes(["Oral."]);
    // A range asked of a prose leaf, and prose asked of the routes array.
    expect(
      readStoredInlineValue(live, "dosage.routes[0].notes", {
        min: null,
        max: null,
        unit: "",
      }),
    ).toBeNull();
    expect(readStoredInlineValue(live, "dosage.routes", "")).toBeNull();
    expect(readStoredInlineValue(null, "dosage.routes[0].notes", "")).toBeNull();
  });

  it("reads a dose range as a whole value", () => {
    const base = createEmptyArticle();
    const live = {
      ...base,
      dosage: {
        ...base.dosage,
        routes: [
          {
            route: "oral",
            dose_ranges: { light: { min: 15, max: 30, unit: "mg" } },
            notes: "",
          },
        ],
      },
    } as unknown as SubstanceArticle;

    expect(
      readStoredInlineValue(live, "dosage.routes[0].dose_ranges.light", {
        min: 10,
        max: 20,
        unit: "mg",
      }),
    ).toEqual({ min: 15, max: 30, unit: "mg" });
    // An unset tier reads as the empty range, which is what a blank dose shows
    // and what the write layer compares an empty field against.
    expect(
      readStoredInlineValue(live, "dosage.routes[0].dose_ranges.common", {
        min: 10,
        max: 20,
        unit: "mg",
      }),
    ).toEqual({ min: null, max: null, unit: "" });
  });
});

describe("applyInlineFieldEdits", () => {
  it("returns the article untouched when there are no edits", () => {
    const article = articleWithRoutes(["Oral.", "Insufflated."]);
    expect(applyInlineFieldEdits(article, undefined)).toBe(article);
  });

  it("layers a saved edit over the value it replaced", () => {
    const article = articleWithRoutes(["Oral.", "Insufflated."]);
    const next = applyInlineFieldEdits(article, {
      "dosage.routes[1].notes": { before: "Insufflated.", value: "Insufflated, fixed." },
    });

    expect(routeNotes(next)).toEqual(["Oral.", "Insufflated, fixed."]);
  });

  it("drops an edit the form has since overwritten", () => {
    const article = articleWithRoutes(["Oral.", "Applied through the form."]);
    const next = applyInlineFieldEdits(article, {
      "dosage.routes[1].notes": { before: "Insufflated.", value: "Inline edit." },
    });

    expect(routeNotes(next)).toEqual(["Oral.", "Applied through the form."]);
  });

  it("drops an edit whose route was reordered out from under it", () => {
    const reordered = articleWithRoutes(
      ["Insufflated.", "Oral."],
      ["insufflated", "oral"],
    );
    const next = applyInlineFieldEdits(reordered, {
      "dosage.routes[1].notes": { before: "Insufflated.", value: "Inline edit." },
    });

    expect(routeNotes(next)).toEqual(["Insufflated.", "Oral."]);
  });

  it("never pads an array whose element was removed", () => {
    const shortened = articleWithRoutes(["Oral."]);
    const next = applyInlineFieldEdits(shortened, {
      "dosage.routes[1].notes": { before: "Insufflated.", value: "Inline edit." },
    });

    expect(next.dosage.routes).toHaveLength(1);
    expect(next).toBe(shortened);
  });

  it("never pads an array for an overlay whose baseline was empty", () => {
    // The dangerous variant of the case above: an edit that *filled in* a blank
    // note carries `before: ""`, and a removed element also reads as absent, so
    // a value comparison alone cannot tell the two apart.
    const shortened = articleWithRoutes(["Oral."]);
    const next = applyInlineFieldEdits(shortened, {
      "dosage.routes[1].notes": { before: "", value: "Inline edit." },
    });

    expect(next.dosage.routes).toHaveLength(1);
    expect(next).toBe(shortened);
  });

  it("re-applies an edit that filled in a blank field", () => {
    const article = articleWithRoutes(["Oral.", ""]);
    const next = applyInlineFieldEdits(article, {
      "dosage.routes[1].notes": { before: "", value: "Insufflated, added." },
    });

    expect(routeNotes(next)).toEqual(["Oral.", "Insufflated, added."]);
  });
});

function articleWithLightDose(
  light: { min: number | null; max: number | null; unit: string } | undefined,
): SubstanceArticle {
  const base = createEmptyArticle();
  return {
    ...base,
    dosage: {
      ...base.dosage,
      routes: [
        {
          route: "oral",
          notes: "",
          dose_ranges: light ? { light } : {},
        },
      ],
    },
  } as unknown as SubstanceArticle;
}

const LIGHT_PATH = "dosage.routes[0].dose_ranges.light";

describe("applyInlineFieldEdits over range fields", () => {
  it("layers a range edit over the range it replaced", () => {
    const article = articleWithLightDose({ min: 10, max: 20, unit: "mg" });
    const next = applyInlineFieldEdits(article, {
      [LIGHT_PATH]: {
        before: { min: 10, max: 20, unit: "mg" },
        value: { min: 12, max: 25, unit: "mg" },
      },
    });

    expect(next.dosage.routes[0].dose_ranges.light).toEqual({
      min: 12,
      max: 25,
      unit: "mg",
    });
  });

  it("drops a range edit the form has since overwritten", () => {
    // A string comparison would call these equal — both stringify the same way
    // only by accident — and an identity comparison would call every re-render
    // a mismatch. The overlay has to compare the range structurally.
    const article = articleWithLightDose({ min: 10, max: 20, unit: "g" });
    const next = applyInlineFieldEdits(article, {
      [LIGHT_PATH]: {
        before: { min: 10, max: 20, unit: "mg" },
        value: { min: 12, max: 25, unit: "mg" },
      },
    });

    expect(next.dosage.routes[0].dose_ranges.light).toEqual({
      min: 10,
      max: 20,
      unit: "g",
    });
  });

  it("re-applies a range edit that filled in an absent tier", () => {
    const article = articleWithLightDose(undefined);
    const next = applyInlineFieldEdits(article, {
      [LIGHT_PATH]: {
        before: { min: null, max: null, unit: "" },
        value: { min: 5, max: 10, unit: "mg" },
      },
    });

    expect(next.dosage.routes[0].dose_ranges.light).toEqual({
      min: 5,
      max: 10,
      unit: "mg",
    });
  });
});

describe("inlineFieldValuesMatch", () => {
  it("reads an absent leaf as the empty value of its kind", () => {
    expect(inlineFieldValuesMatch(undefined, "")).toBe(true);
    expect(inlineFieldValuesMatch(undefined, "Something.")).toBe(false);
    expect(inlineFieldValuesMatch(null, { min: null, max: null, unit: "" })).toBe(true);
    expect(inlineFieldValuesMatch(undefined, { min: 1, max: 2, unit: "mg" })).toBe(false);
  });

  it("refuses to compare across kinds", () => {
    expect(inlineFieldValuesMatch({ min: 1, max: 2, unit: "mg" }, "1-2 mg")).toBe(false);
    expect(inlineFieldValuesMatch("1-2 mg", { min: 1, max: 2, unit: "mg" })).toBe(false);
  });

  it("tolerates a stored range carrying legacy extra keys", () => {
    expect(
      inlineFieldValuesMatch(
        { min: 10, max: 20, unit: "mg", source: "legacy" },
        { min: 10, max: 20, unit: "mg" },
      ),
    ).toBe(true);
  });
});

describe("asInlineFieldValue", () => {
  it("prefers the stored value and falls back across a kind mismatch", () => {
    expect(asInlineFieldValue("stored", "claimed")).toBe("stored");
    expect(asInlineFieldValue(undefined, "claimed")).toBe("claimed");
    expect(
      asInlineFieldValue({ min: 1, max: 2, unit: "mg", extra: true }, {
        min: 9,
        max: 9,
        unit: "g",
      }),
    ).toEqual({ min: 1, max: 2, unit: "mg" });
    expect(asInlineFieldValue("not a range", { min: 9, max: 9, unit: "g" })).toEqual({
      min: 9,
      max: 9,
      unit: "g",
    });
  });
});
