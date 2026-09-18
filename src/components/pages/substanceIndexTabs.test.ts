import { describe, expect, it } from "vitest";

import {
  buildSubstanceIndexTabItems,
  orderCategoriesForAllTab,
  resolveSubstanceIndexSuperTabs,
  type SubstanceIndexTabGroup,
} from "./substanceIndexTabs";

const group = (key: string): SubstanceIndexTabGroup => ({ key, name: key, icon: "lucide:layers" });

/**
 * The public index and the /dev index layout editor read this strip from the
 * same place, so an editor never reorders panels against a row readers see
 * differently.
 */
describe("substance index tabs", () => {
  it("orders the strip All, umbrella, category, and breaks the row after Cannabinoid", () => {
    const items = buildSubstanceIndexTabItems(
      ["miscellaneous", "opioid", "psychedelic", "cannabinoid", "gabaergic", "deliriant"].map(group),
    );

    expect(items.map((item) => item.id)).toEqual([
      "all",
      "super:hallucinogens",
      "psychedelic",
      "deliriant",
      "cannabinoid",
      "super:depressants",
      "gabaergic",
      "opioid",
    ]);
    expect(items.filter((item) => item.prominence === "major").map((item) => item.id)).toEqual([
      "all",
      "super:hallucinogens",
      "super:depressants",
    ]);
    expect(items.find((item) => item.id === "cannabinoid")?.breakAfter).toBe(true);
  });

  it("drops an umbrella tab with no category behind it", () => {
    expect(buildSubstanceIndexTabItems([group("stimulant")]).map((item) => item.id)).toEqual(["all", "stimulant"]);
    expect(resolveSubstanceIndexSuperTabs((key) => key === "opioid").map((tab) => tab.id)).toEqual([
      "super:depressants",
    ]);
  });

  it("reads the All tab left to right, then the categories without a tab", () => {
    expect(
      orderCategoriesForAllTab(["miscellaneous", "opioid", "hallucinogen", "psychedelic"].map(group)).map(
        (entry) => entry.key,
      ),
    ).toEqual(["psychedelic", "opioid", "miscellaneous", "hallucinogen"]);
  });
});
