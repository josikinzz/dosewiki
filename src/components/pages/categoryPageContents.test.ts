import { describe, expect, it } from "vitest";

import type { DrugClassContent } from "@/data/drugClassContent";
import {
  buildCategoryTocItems,
  categorySectionAnchorId,
  filterEffectsByTags,
  resolveDrugClassSections,
  CATEGORY_OVERVIEW_ANCHOR_ID,
  CATEGORY_SUBSTANCES_ANCHOR_ID,
  type CategoryEffect,
} from "./categoryPageContents";

const content: DrugClassContent = {
  categoryKey: "psychedelic",
  title: "Subjective Effects of Psychedelics",
  introHtml: "<p>Intro</p>",
  applicableSubstances: "LSD, psilocybin mushrooms.",
  sections: [
    {
      title: "Visual Amplifications",
      icon: "lucide:arrow-up",
      description: "Amplifications.",
      effectTags: ["psychedelic", "visual", "enhancement"],
    },
    {
      title: "Visual Distortions",
      icon: "lucide:move",
      description: "Distortions.",
      effectTags: ["psychedelic", "visual"],
      excludeTags: ["enhancement"],
    },
    {
      title: "Transpersonal States",
      icon: "lucide:sparkles",
      description: "Transpersonal.",
      effectTags: ["psychedelic", "transpersonal"],
    },
  ],
};

const effect = (slug: string, tags: string[]): CategoryEffect => ({
  slug,
  name: slug,
  tags,
  summary: `${slug} summary`,
});

const effects: CategoryEffect[] = [
  effect("visual-brightening", ["Psychedelic", "Visual", "Enhancement"]),
  effect("visual-drift", ["psychedelic", "visual", "distortion"]),
  effect("nausea", ["physical"]),
];

describe("filterEffectsByTags", () => {
  it("matches tags case-insensitively and requires every tag", () => {
    expect(
      filterEffectsByTags(effects, ["psychedelic", "visual", "enhancement"]).map(
        (item) => item.slug,
      ),
    ).toEqual(["visual-brightening"]);
  });

  it("drops effects carrying an excluded tag", () => {
    expect(
      filterEffectsByTags(effects, ["psychedelic", "visual"], ["enhancement"]).map(
        (item) => item.slug,
      ),
    ).toEqual(["visual-drift"]);
  });
});

describe("resolveDrugClassSections", () => {
  it("keeps declared order and drops sections without matching effects", () => {
    const sections = resolveDrugClassSections(content, effects);

    expect(sections.map(({ section }) => section.title)).toEqual([
      "Visual Amplifications",
      "Visual Distortions",
    ]);
    expect(sections[1]?.effects.map((item) => item.slug)).toEqual(["visual-drift"]);
  });

  it("returns nothing when the category has no drug-class content", () => {
    expect(resolveDrugClassSections(undefined, effects)).toEqual([]);
  });
});

describe("buildCategoryTocItems", () => {
  it("derives one entry per rendered section, framed by overview and substances", () => {
    const sections = resolveDrugClassSections(content, effects);
    const items = buildCategoryTocItems({
      sections,
      hasOverview: true,
      substanceCount: 42,
      substanceIcon: "lucide:layers",
    });

    expect(items.map((item) => item.id)).toEqual([
      CATEGORY_OVERVIEW_ANCHOR_ID,
      "visual-amplifications",
      "visual-distortions",
      CATEGORY_SUBSTANCES_ANCHOR_ID,
    ]);
    expect(items.map((item) => item.label)).toEqual([
      "Overview",
      "Visual Amplifications",
      "Visual Distortions",
      "Substances (42)",
    ]);
    expect(items[1]?.icon).toBe("lucide:arrow-up");
  });

  it("points every section entry at the anchor the section renders with", () => {
    const sections = resolveDrugClassSections(content, effects);
    const items = buildCategoryTocItems({
      sections,
      hasOverview: true,
      substanceCount: 0,
      substanceIcon: "lucide:layers",
    });

    for (const { section } of sections) {
      expect(items.some((item) => item.id === categorySectionAnchorId(section))).toBe(
        true,
      );
    }
  });

  it("falls back to a lone substances entry for categories without an article", () => {
    const items = buildCategoryTocItems({
      sections: [],
      hasOverview: false,
      substanceCount: 7,
      substanceIcon: "lucide:layers",
    });

    expect(items).toEqual([
      {
        id: CATEGORY_SUBSTANCES_ANCHOR_ID,
        label: "Substances (7)",
        icon: "lucide:layers",
      },
    ]);
  });
});
