import { describe, expect, it } from "vitest";

import type { ManualCategoryDefinition } from "./types";
import { areCategoriesEqual, areManualsEqual } from "./utils";

const base: ManualCategoryDefinition = {
  key: "psychedelics",
  label: "Psychedelics",
  iconKey: "sparkle",
  notes: "",
  drugs: ["lsd", "psilocybin"],
  sections: [{ key: "tryptamines", label: "Tryptamines", drugs: ["dmt"] }],
};

describe("areCategoriesEqual", () => {
  it("treats structurally identical categories as equal", () => {
    expect(areCategoriesEqual([base], [{ ...base, drugs: [...base.drugs], sections: [...base.sections] }])).toBe(true);
  });

  it.each<[string, Partial<ManualCategoryDefinition>]>([
    ["label", { label: "Psychedelic" }],
    ["iconKey", { iconKey: "leaf" }],
    ["notes", { notes: "Classic serotonergics." }],
    ["drug order", { drugs: ["psilocybin", "lsd"] }],
    ["section drugs", { sections: [{ key: "tryptamines", label: "Tryptamines", drugs: ["dmt", "5-meo-dmt"] }] }],
    ["section link", { sections: [{ ...base.sections[0], link: { type: "chemicalClass", value: "tryptamine" } }] }],
  ])("detects a %s change", (_field, change) => {
    expect(areCategoriesEqual([base], [{ ...base, ...change }])).toBe(false);
  });

  it("detects a category added or removed", () => {
    expect(areCategoriesEqual([base], [base, { ...base, key: "stimulants" }])).toBe(false);
    expect(areManualsEqual({ version: 1, categories: [base] }, { version: 1, categories: [] })).toBe(false);
  });

  // Known gap: the comparison covers `key`, `label`, `iconKey`, `notes`,
  // `drugs` and `sections` and ignores `columns`, so a column-only
  // reassignment reads as "no change".
  it.fails("detects a column assignment change", () => {
    expect(areCategoriesEqual([base], [{ ...base, columns: { "3": 2 } }])).toBe(false);
  });
});
