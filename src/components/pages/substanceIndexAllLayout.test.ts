import { describe, expect, it } from "vitest";

import type { DosageCategoryGroup } from "@/data/builders/library";
import manualIndex from "@data/substances/psychoactiveIndexManual.json";
import { arrangeGroupsByLayout } from "@/features/article/components/sections/CategoryGrid";

import { SUBSTANCE_INDEX_ALL_COLUMN_LAYOUT } from "./substanceIndexAllLayout";

const LIVE_KEYS = manualIndex.categories.map((category) => category.key).sort();

const TOP_ROW_PRIORITY = [
  "psychedelic",
  "dissociative",
  "deliriant",
  "entactogen",
  "cannabinoid",
  "nootropic",
  "stimulant",
  "gabaergic",
  "opioid",
  "antidepressant",
  "antipsychotic",
  "miscellaneous",
];

const counts = Object.keys(SUBSTANCE_INDEX_ALL_COLUMN_LAYOUT).map(Number).sort((a, b) => a - b);

function group(key: string): DosageCategoryGroup {
  return { key, name: key, icon: "lucide:circle", total: 1, drugs: [{ name: key, slug: key }] };
}

describe("SUBSTANCE_INDEX_ALL_COLUMN_LAYOUT", () => {
  it("covers every column count from one through one column per category", () => {
    expect(counts).toEqual(Array.from({ length: LIVE_KEYS.length }, (_, index) => index + 1));
  });

  it.each(counts)("places every live category exactly once at %i columns", (count) => {
    const layout = SUBSTANCE_INDEX_ALL_COLUMN_LAYOUT[count];
    expect(layout).toHaveLength(count);
    expect(layout.flat().sort()).toEqual(LIVE_KEYS);
  });

  it.each(counts)("leads each column with the priority order at %i columns", (count) => {
    const layout = SUBSTANCE_INDEX_ALL_COLUMN_LAYOUT[count];
    const topRow = layout.map((column) => column[0]);
    if (count === LIVE_KEYS.length) {
      // Only when every category has its own column does A-typical
      // Hallucinogen reach the top row, straight after Deliriant.
      expect(topRow).toEqual([...TOP_ROW_PRIORITY.slice(0, 3), "hallucinogen", ...TOP_ROW_PRIORITY.slice(3)]);
      return;
    }
    expect(topRow).toEqual(TOP_ROW_PRIORITY.slice(0, count));
    const deliriantColumn = layout.find((column) => column[0] === "deliriant") ?? layout[0];
    expect(deliriantColumn.indexOf("hallucinogen")).toBe(deliriantColumn.indexOf("deliriant") + 1);
  });
});

describe("arrangeGroupsByLayout", () => {
  const table = { 2: [["a", "b"], ["c"]] };

  it("orders groups by the table and drops keys with no group", () => {
    const columns = arrangeGroupsByLayout([group("c"), group("a")], table, 2);
    expect(columns.get(0)?.map((entry) => entry.key)).toEqual(["a"]);
    expect(columns.get(1)?.map((entry) => entry.key)).toEqual(["c"]);
  });

  it("appends groups the table does not know to the emptiest column", () => {
    const columns = arrangeGroupsByLayout([group("a"), group("b"), group("c"), group("z")], table, 2);
    expect(columns.get(1)?.map((entry) => entry.key)).toEqual(["c", "z"]);
  });

  it("reuses the largest entry when the column count exceeds the table", () => {
    const columns = arrangeGroupsByLayout([group("a"), group("b"), group("c")], table, 4);
    expect(columns.get(0)?.map((entry) => entry.key)).toEqual(["a", "b"]);
    expect(columns.get(1)?.map((entry) => entry.key)).toEqual(["c"]);
    expect(columns.get(2)).toEqual([]);
    expect(columns.get(3)).toEqual([]);
  });
});
