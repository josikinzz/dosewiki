import { describe, expect, it } from "vitest";

import {
  buildFieldPath,
  getArticleValueByPath,
  setArticleValueByPath,
} from "./fieldPath";

describe("fieldPath", () => {
  it("gets and sets article values without mutating the source article", () => {
    const article = {
      identification: { common_name: "Old" },
      dosage: { routes: [{ route: "Oral", dose_ranges: { light: { min: 1 } } }] },
    };

    const updated = setArticleValueByPath(article, "dosage.routes[0].dose_ranges.light.max", 3);

    expect(getArticleValueByPath(updated, "dosage.routes[0].dose_ranges.light.max")).toBe(3);
    expect(getArticleValueByPath(article, "dosage.routes[0].dose_ranges.light.max")).toBeUndefined();
  });

  it("does not write template or invalid paths into article data", () => {
    const article = { dosage: { routes: [{ route: "Oral" }] } };

    expect(setArticleValueByPath(article, "dosage.routes[].route", "IV")).toBe(article);
    expect(setArticleValueByPath(article, "dosage..route", "IV")).toBe(article);
  });

  it("round trips awkward keys through an article", () => {
    const article = { legality: { countries: {} } } as never;
    for (const key of [
      "United States",
      "United States (Florida)",
      "1. Taking Off",
      "Côte d'Ivoire",
      "Hallucinatory States",
    ]) {
      const path = buildFieldPath("legality", "countries", key, "notes");
      const next = setArticleValueByPath(article, path, `Note for ${key}.`);
      expect(getArticleValueByPath(next, path)).toBe(`Note for ${key}.`);
      expect(
        (next as { legality: { countries: Record<string, { notes: string }> } })
          .legality.countries[key].notes,
      ).toBe(`Note for ${key}.`);
    }
  });

  it("refuses to walk or write a reserved prototype key", () => {
    const article = { legality: { countries: {} } } as never;
    const polluted = setArticleValueByPath(
      article,
      "legality.countries.__proto__.notes",
      "polluted",
    );

    expect(polluted).toBe(article);
    expect(({} as Record<string, unknown>).notes).toBeUndefined();
    expect(
      getArticleValueByPath({ a: { b: 1 } }, "a.constructor"),
    ).toBeUndefined();
    expect(
      setArticleValueByPath({ a: {} }, "a.prototype.x", 1),
    ).toEqual({ a: {} });
  });
});
