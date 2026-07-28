import { describe, expect, it } from "vitest";
import {
  buildEffectCategoryGroups,
  getParentCategoryConfig,
  OTHER_GROUP_ID,
  resolveSubcategorySlug,
  type EffectCategoryGroupEffect,
} from "./effectCategoryGroups";

function effect(
  name: string,
  tags: string[],
  slug = name.toLowerCase().replace(/\s+/g, "-"),
): EffectCategoryGroupEffect {
  return { slug, name, tags };
}

describe("resolveSubcategorySlug", () => {
  it("resolves a subcategory tag conjunction to its own category page", () => {
    expect(resolveSubcategorySlug(["visual", "amplification"], "visual-effects")).toBe(
      "visual-amplifications",
    );
    expect(resolveSubcategorySlug(["uncomfortable", "cardiovascular"], "physical-effects")).toBe(
      "cardiovascular-effects",
    );
  });

  it("ignores tag order and casing", () => {
    expect(resolveSubcategorySlug(["Geometric", "VISUAL"], "visual-effects")).toBe(
      "geometric-patterns",
    );
  });

  it("never resolves to the parent category itself", () => {
    expect(resolveSubcategorySlug(["auditory"], "auditory-effects")).toBeUndefined();
  });

  it("returns undefined when the only candidate page unions several conjunctions", () => {
    expect(resolveSubcategorySlug(["gustatory"], "smell-and-taste-effects")).toBeUndefined();
  });

  it("returns undefined for tags no category page covers", () => {
    expect(resolveSubcategorySlug(["not-a-real-tag"], "visual-effects")).toBeUndefined();
  });
});

describe("getParentCategoryConfig", () => {
  it("matches on route slug, not config key", () => {
    expect(getParentCategoryConfig("visual-effects")?.key).toBe("visual");
    expect(getParentCategoryConfig("visual")).toBeUndefined();
  });
});

describe("buildEffectCategoryGroups", () => {
  it("returns no groups for a leaf category", () => {
    const groups = buildEffectCategoryGroups({
      categorySlug: "visual-amplifications",
      effects: [effect("Colour Enhancement", ["visual", "amplification"])],
    });

    expect(groups).toEqual([]);
  });

  it("returns no groups for a parent whose only subcategory is unnamed", () => {
    const groups = buildEffectCategoryGroups({
      categorySlug: "auditory-effects",
      effects: [effect("Auditory Distortion", ["auditory", "distortion"])],
    });

    expect(groups).toEqual([]);
  });

  it("groups a parent category by its subcategories with links and definitions", () => {
    const groups = buildEffectCategoryGroups({
      categorySlug: "visual-effects",
      effects: [
        effect("Colour Enhancement", ["visual", "amplification"]),
        effect("Frame Rate Suppression", ["visual", "suppression"]),
        effect("Drifting", ["visual", "distortion"]),
      ],
    });

    expect(groups.map((group) => group.title)).toEqual([
      "Amplifications",
      "Suppressions",
      "Distortions",
    ]);
    expect(groups[0].id).toBe("group-visual-amp");
    expect(groups[0].categorySlug).toBe("visual-amplifications");
    expect(groups[0].description).toContain("Visual amplifications are defined");
    expect(groups[0].effects.map((item) => item.name)).toEqual(["Colour Enhancement"]);
  });

  it("drops subcategories that have no matching effects", () => {
    const groups = buildEffectCategoryGroups({
      categorySlug: "visual-effects",
      effects: [
        effect("Colour Enhancement", ["visual", "amplification"]),
        effect("Drifting", ["visual", "distortion"]),
      ],
    });

    expect(groups.map((group) => group.title)).toEqual(["Amplifications", "Distortions"]);
  });

  it("collects effects matching no subcategory into a trailing Other group", () => {
    const groups = buildEffectCategoryGroups({
      categorySlug: "visual-effects",
      effects: [
        effect("Colour Enhancement", ["visual", "amplification"]),
        effect("Drifting", ["visual", "distortion"]),
        effect("Unsorted Visual", ["visual"]),
      ],
    });

    const other = groups[groups.length - 1];
    expect(other?.id).toBe(OTHER_GROUP_ID);
    expect(other?.title).toBe("Other Visual Effects");
    expect(other?.categorySlug).toBeUndefined();
    expect(other?.effects.map((item) => item.name)).toEqual(["Unsorted Visual"]);
  });

  it("keeps an effect that matches two subcategories out of the Other group", () => {
    const groups = buildEffectCategoryGroups({
      categorySlug: "visual-effects",
      effects: [
        effect("Overlapping", ["visual", "amplification", "distortion"]),
        effect("Drifting", ["visual", "distortion"]),
      ],
    });

    expect(groups.map((group) => group.id)).toEqual(["group-visual-amp", "group-visual-dist"]);
    expect(groups.some((group) => group.id === OTHER_GROUP_ID)).toBe(false);
  });

  it("groups subcategories that have no page of their own without a link", () => {
    const groups = buildEffectCategoryGroups({
      categorySlug: "smell-and-taste-effects",
      effects: [
        effect("Taste Enhancement", ["gustatory"]),
        effect("Smell Enhancement", ["olfactory"]),
      ],
    });

    expect(groups.map((group) => group.title)).toEqual([
      "Gustatory Effects",
      "Olfactory Effects",
    ]);
    expect(groups.every((group) => group.categorySlug === undefined)).toBe(true);
  });

  it("falls back to a flat list when fewer than two groups survive", () => {
    const groups = buildEffectCategoryGroups({
      categorySlug: "visual-effects",
      effects: [effect("Colour Enhancement", ["visual", "amplification"])],
    });

    expect(groups).toEqual([]);
  });

  it("assigns unique anchor ids to every group", () => {
    const groups = buildEffectCategoryGroups({
      categorySlug: "physical-effects",
      effects: [
        effect("Stimulation", ["physical", "amplification"]),
        effect("Sedation", ["physical", "suppression"]),
        effect("Bodily Control Enhancement", ["physical", "alteration"]),
        effect("Nausea", ["physical", "uncomfortable", "bodily"]),
        effect("Increased Heart Rate", ["physical", "uncomfortable", "cardiovascular"]),
        effect("Headaches", ["physical", "uncomfortable", "neurological"]),
        effect("Loose Physical", ["physical"]),
      ],
    });

    const ids = groups.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[ids.length - 1]).toBe(OTHER_GROUP_ID);
  });
});
