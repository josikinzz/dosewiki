import { describe, expect, it } from "vitest";

import {
  addCategory,
  addSection,
  addSlug,
  bumpSlug,
  collectPlacedSlugs,
  placeSection,
  moveSlug,
  removeCategory,
  removeSection,
  removeSlug,
  renameSection,
  sortCategory,
  sortSlot,
  updateCategoryIdentity,
} from "./layoutOps";
import type { ManualIndexConfig } from "./types";

const MANUAL: ManualIndexConfig = {
  version: 1,
  categories: [
    {
      key: "psychedelic",
      label: "Psychedelic",
      iconKey: "psychedelic",
      drugs: ["loose"],
      sections: [
        { key: "common", label: "Common", drugs: ["lsd", "dmt", "mescaline"] },
        { key: "tryptamine", label: "Tryptamine", drugs: ["4-aco-dmt", "dmt"] },
      ],
    },
    {
      key: "dissociative",
      label: "Dissociative",
      iconKey: "dissociative",
      drugs: [],
      sections: [{ key: "common", label: "Common", drugs: ["ketamine"] }],
    },
  ],
};

const COMMON = { categoryKey: "psychedelic", sectionKey: "common" };
const TRYPTAMINE = { categoryKey: "psychedelic", sectionKey: "tryptamine" };
const TOP = { categoryKey: "psychedelic", sectionKey: null };
const KET_COMMON = { categoryKey: "dissociative", sectionKey: "common" };

const drugsOf = (manual: ManualIndexConfig, categoryKey: string, sectionKey: string | null) => {
  const category = manual.categories.find((entry) => entry.key === categoryKey)!;
  return sectionKey === null
    ? category.drugs
    : category.sections.find((section) => section.key === sectionKey)!.drugs;
};

describe("bumpSlug", () => {
  it("steps a slug within its slot and stops at the ends", () => {
    expect(drugsOf(bumpSlug(MANUAL, COMMON, "dmt", "up"), "psychedelic", "common")).toEqual([
      "dmt",
      "lsd",
      "mescaline",
    ]);
    expect(bumpSlug(MANUAL, COMMON, "lsd", "up")).toBe(MANUAL);
    expect(bumpSlug(MANUAL, COMMON, "mescaline", "down")).toBe(MANUAL);
    expect(bumpSlug(MANUAL, COMMON, "absent", "down")).toBe(MANUAL);
  });
});

describe("moveSlug", () => {
  it("reorders within one slot to a target index", () => {
    const next = moveSlug(MANUAL, COMMON, "mescaline", COMMON, 0);
    expect(drugsOf(next, "psychedelic", "common")).toEqual(["mescaline", "lsd", "dmt"]);
    expect(moveSlug(MANUAL, COMMON, "lsd", COMMON, 0)).toBe(MANUAL);
  });

  it("moves across sections, categories, and the top-level list, landing at the index", () => {
    const toSection = moveSlug(MANUAL, COMMON, "lsd", TRYPTAMINE, 1);
    expect(drugsOf(toSection, "psychedelic", "common")).toEqual(["dmt", "mescaline"]);
    expect(drugsOf(toSection, "psychedelic", "tryptamine")).toEqual(["4-aco-dmt", "lsd", "dmt"]);

    const toCategory = moveSlug(MANUAL, COMMON, "lsd", KET_COMMON);
    expect(drugsOf(toCategory, "dissociative", "common")).toEqual(["ketamine", "lsd"]);

    const toTop = moveSlug(MANUAL, COMMON, "lsd", TOP, 0);
    expect(drugsOf(toTop, "psychedelic", null)).toEqual(["lsd", "loose"]);
  });

  it("does not duplicate a slug the destination already holds", () => {
    const next = moveSlug(MANUAL, COMMON, "dmt", TRYPTAMINE);
    expect(drugsOf(next, "psychedelic", "common")).toEqual(["lsd", "mescaline"]);
    expect(drugsOf(next, "psychedelic", "tryptamine")).toEqual(["4-aco-dmt", "dmt"]);
  });

  it("leaves the manual untouched for an unknown origin or destination", () => {
    expect(moveSlug(MANUAL, { categoryKey: "nope", sectionKey: null }, "lsd", COMMON)).toBe(MANUAL);
    expect(moveSlug(MANUAL, COMMON, "lsd", { categoryKey: "psychedelic", sectionKey: "nope" })).toBe(MANUAL);
  });
});

describe("addSlug / removeSlug / sortSlot", () => {
  it("appends slugified entries once and removes by slug", () => {
    const added = addSlug(MANUAL, COMMON, "2C-B");
    expect(drugsOf(added, "psychedelic", "common")).toEqual(["lsd", "dmt", "mescaline", "2c-b"]);
    expect(addSlug(added, COMMON, "2c-b")).toBe(added);
    expect(drugsOf(removeSlug(added, COMMON, "2c-b"), "psychedelic", "common")).toEqual(["lsd", "dmt", "mescaline"]);
    expect(removeSlug(MANUAL, COMMON, "absent")).toBe(MANUAL);
  });

  it("sorts one slot with the supplied comparator and is a no-op when already sorted", () => {
    const sorted = sortSlot(MANUAL, COMMON, (slugs) => [...slugs].sort());
    expect(drugsOf(sorted, "psychedelic", "common")).toEqual(["dmt", "lsd", "mescaline"]);
    expect(sortSlot(sorted, COMMON, (slugs) => [...slugs].sort())).toBe(sorted);
  });

  it("sorts every list a category owns and keeps its identity when nothing moves", () => {
    const sorted = sortCategory(MANUAL, "psychedelic", (slugs) => [...slugs].sort());
    expect(drugsOf(sorted, "psychedelic", null)).toEqual(["loose"]);
    expect(drugsOf(sorted, "psychedelic", "common")).toEqual(["dmt", "lsd", "mescaline"]);
    expect(drugsOf(sorted, "psychedelic", "tryptamine")).toEqual(["4-aco-dmt", "dmt"]);
    // Other categories are untouched, and a sorted category is left alone.
    expect(sorted.categories[1]).toBe(MANUAL.categories[1]);
    expect(sortCategory(sorted, "psychedelic", (slugs) => [...slugs].sort())).toBe(sorted);
  });
});

describe("sections", () => {
  it("places, renames, adds, and removes sections", () => {
    const moved = placeSection(MANUAL, "psychedelic", "tryptamine", "common", "before");
    expect(moved.categories[0].sections.map((section) => section.key)).toEqual(["tryptamine", "common"]);
    expect(placeSection(MANUAL, "psychedelic", "tryptamine", "common", "after")).toBe(MANUAL);
    expect(placeSection(MANUAL, "psychedelic", "tryptamine", "nope", "before")).toBe(MANUAL);

    expect(renameSection(MANUAL, "psychedelic", "common", " Popular ").categories[0].sections[0].label).toBe("Popular");
    expect(renameSection(MANUAL, "psychedelic", "common", "  ")).toBe(MANUAL);

    const added = addSection(MANUAL, "psychedelic", "Common");
    expect(added.sectionKey).toBe("common-2");
    expect(added.manual.categories[0].sections).toHaveLength(3);
    expect(addSection(MANUAL, "psychedelic", "").sectionKey).toBeNull();

    const dissolved = removeSection(MANUAL, "psychedelic", "common", true);
    expect(dissolved.categories[0].sections.map((section) => section.key)).toEqual(["tryptamine"]);
    expect(dissolved.categories[0].drugs).toEqual(["loose", "lsd", "dmt", "mescaline"]);
    const dropped = removeSection(MANUAL, "psychedelic", "common", false);
    expect(dropped.categories[0].drugs).toEqual(["loose"]);
  });
});

describe("categories", () => {
  it("adds with a unique key, patches identity, and removes", () => {
    const added = addCategory(MANUAL, "Psychedelic", "");
    expect(added.categoryKey).toBe("psychedelic-2");
    expect(added.manual.categories[2]).toMatchObject({ label: "Psychedelic", iconKey: "psychedelic-2", drugs: [], sections: [] });

    const patched = updateCategoryIdentity(MANUAL, "psychedelic", { label: "Psychedelics", iconKey: "" });
    expect(patched.categories[0]).toMatchObject({ label: "Psychedelics", iconKey: "psychedelic" });
    expect(updateCategoryIdentity(MANUAL, "psychedelic", {})).toBe(MANUAL);

    expect(removeCategory(MANUAL, "dissociative").categories.map((category) => category.key)).toEqual(["psychedelic"]);
    expect(removeCategory(MANUAL, "nope")).toBe(MANUAL);
  });
});

describe("placement lookups", () => {
  it("collects every placed slug across the layout", () => {
    expect([...collectPlacedSlugs(MANUAL)].sort()).toEqual(["4-aco-dmt", "dmt", "ketamine", "loose", "lsd", "mescaline"]);
  });
});
