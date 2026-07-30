import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema";
import type { SubstanceArticle } from "@/schema";

import { applyInlineFieldEdits } from "./inlineFieldEdits";

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
});
