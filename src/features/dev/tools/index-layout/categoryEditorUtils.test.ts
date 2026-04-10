import { describe, expect, it } from "vitest";
import type { ManualCategoryDefinition, ManualCategorySection } from "./types";
import {
  collectNormalizedCategorySlugs,
  computeSlugCounts,
  removeCategorySection,
  reorderCategorySections,
  resolveCategoryColumn,
  updateCategoryField,
} from "./categoryEditorUtils";

const baseSection = (overrides: Partial<ManualCategorySection> = {}): ManualCategorySection => ({
  key: overrides.key ?? "section-a",
  label: overrides.label ?? "Section A",
  drugs: overrides.drugs ?? ["gamma-ray"],
  notes: overrides.notes,
  link: overrides.link,
});

const baseCategory = (
  overrides: Partial<ManualCategoryDefinition> = {},
): ManualCategoryDefinition => ({
  key: overrides.key ?? "phenethylamines",
  label: overrides.label ?? "Phenethylamines",
  iconKey: overrides.iconKey ?? "sparkle",
  notes: overrides.notes ?? "",
  drugs: overrides.drugs ?? ["Alpha Entry"],
  sections: overrides.sections ?? [
    baseSection({
      key: "section-a",
      label: "Section A",
      drugs: ["beta-entry"],
    }),
    baseSection({
      key: "section-b",
      label: "Section B",
      drugs: ["Alpha Entry"],
    }),
  ],
  column: overrides.column,
  columns: overrides.columns,
});

describe("categoryEditorUtils", () => {
  it("counts normalized slugs across top-level and section entries", () => {
    const counts = computeSlugCounts(baseCategory());

    expect(counts.get("alpha-entry")).toBe(2);
    expect(counts.get("beta-entry")).toBe(1);
  });

  it("resolves the category column using responsive overrides before legacy fallbacks", () => {
    expect(
      resolveCategoryColumn(
        baseCategory({
          columns: { "3": 2 },
          column: 1,
        }),
        3,
        0,
      ),
    ).toBe(2);

    expect(resolveCategoryColumn(baseCategory({ column: 5 }), 4, 1)).toBe(1);
    expect(resolveCategoryColumn(baseCategory({ column: undefined, columns: undefined }), 4, 6)).toBe(2);
  });

  it("collects normalized slugs for duplicate detection across the whole category", () => {
    expect([...collectNormalizedCategorySlugs(baseCategory())].sort()).toEqual([
      "alpha-entry",
      "beta-entry",
    ]);
  });

  it("updates category fields without recreating identical objects", () => {
    const category = baseCategory();

    expect(updateCategoryField(category, "label", category.label)).toBe(category);
    expect(updateCategoryField(category, "notes", "Needs review")).toEqual({
      ...category,
      notes: "Needs review",
    });
  });

  it("removes and reorders category sections immutably", () => {
    const category = baseCategory();

    const removed = removeCategorySection(category, 0);
    expect(removed.sections.map((section) => section.key)).toEqual(["section-b"]);
    expect(category.sections.map((section) => section.key)).toEqual(["section-a", "section-b"]);

    const reordered = reorderCategorySections(
      category,
      "phenethylamines::section-a",
      "phenethylamines::section-b",
    );
    expect(reordered.sections.map((section) => section.key)).toEqual(["section-b", "section-a"]);
  });
});
