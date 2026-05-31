import { describe, expect, it } from "vitest";
import type { SubstanceRecord } from "@/data/builders/contentBuilder";
import type { ManualIndexConfig } from "./types";
import { createLayoutDataHelpers } from "./layoutDataUtils";

const buildRecord = (
  overrides: Partial<SubstanceRecord> & Pick<SubstanceRecord, "slug" | "name">,
): SubstanceRecord => ({
  id: null,
  slug: overrides.slug,
  name: overrides.name,
  aliases: overrides.aliases ?? [],
  categories: overrides.categories ?? [],
  indexCategories: overrides.indexCategories ?? [],
  chemicalClasses: overrides.chemicalClasses ?? [],
  psychoactiveClasses: overrides.psychoactiveClasses ?? [],
  priority: overrides.priority ?? "normal",
  isHidden: overrides.isHidden ?? false,
  isLowPriority: overrides.isLowPriority ?? false,
  mechanisms: overrides.mechanisms ?? [],
  content: overrides.content ?? ({} as SubstanceRecord["content"]),
});

const records: SubstanceRecord[] = [
  buildRecord({
    slug: "zeta",
    name: "Zeta",
    categories: ["stimulant"],
  }),
  buildRecord({
    slug: "beta-common",
    name: "Beta Common",
    categories: ["common"],
    aliases: ["B Common"],
  }),
  buildRecord({
    slug: "alpha-common",
    name: "Alpha Common",
    indexCategories: ["common"],
  }),
  buildRecord({
    slug: "hidden-one",
    name: "Hidden One",
    aliases: ["Shadow"],
    categories: ["common"],
    isHidden: true,
  }),
];

const recordsBySlug = new Map(records.map((record) => [record.slug, record]));

describe("createLayoutDataHelpers", () => {
  const helpers = createLayoutDataHelpers(records, recordsBySlug);

  it("prioritizes common-tag substances for psychoactive dataset sorting", () => {
    expect(
      helpers.sortSlugsForDataset("psychoactive", ["zeta", "beta-common", "alpha-common"]),
    ).toEqual(["alpha-common", "beta-common", "zeta"]);
  });

  it("sorts non-psychoactive datasets alphabetically by display name", () => {
    expect(
      helpers.sortSlugsForDataset("chemical", ["zeta", "beta-common", "alpha-common"]),
    ).toEqual(["alpha-common", "beta-common", "zeta"]);
  });

  it("flags missing, hidden, and duplicate slug issues using normalized lookup keys", () => {
    const counts = new Map<string, number>([
      ["hidden-one", 2],
      ["beta-common", 1],
    ]);

    expect(helpers.resolveSlugStatus("Hidden One", counts)).toEqual({
      slug: "Hidden One",
      name: "Hidden One",
      alias: "Shadow",
      issues: ["hidden", "duplicate"],
    });

    expect(helpers.resolveSlugStatus("does-not-exist", counts)).toEqual({
      slug: "does-not-exist",
      issues: ["missing"],
    });
  });

  it("organizes manual entries using the same dataset-aware sort rules", () => {
    const manual: ManualIndexConfig = {
      version: 1,
      categories: [
        {
          key: "psychedelics",
          label: "Psychedelics",
          iconKey: "sparkle",
          drugs: ["zeta", "alpha-common"],
          sections: [
            {
              key: "mixed",
              label: "Mixed",
              drugs: ["zeta", "beta-common"],
            },
          ],
        },
      ],
    };

    expect(helpers.organizeManualEntries("psychoactive", manual)).toEqual({
      version: 1,
      categories: [
        {
          key: "psychedelics",
          label: "Psychedelics",
          iconKey: "sparkle",
          drugs: ["alpha-common", "zeta"],
          sections: [
            {
              key: "mixed",
              label: "Mixed",
              drugs: ["beta-common", "zeta"],
            },
          ],
        },
      ],
    });
  });
});
