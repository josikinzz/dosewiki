import { describe, expect, it } from "vitest";
import type { SubstanceRecord } from "@/data/builders/contentBuilder";
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
  isDirectUrlOnly: overrides.isDirectUrlOnly ?? false,
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
});
