import { describe, expect, it } from "vitest";
import {
  buildSubstancePickerItems,
  groupMoleculePickerItems,
  type MoleculePickerItem,
} from "./moleculePickerOrdering";

const lookup = [
  { slug: "mdma", name: "MDMA", priority: "normal", psychoactiveClasses: ["Entactogen"] },
  { slug: "lsd", name: "LSD", priority: "high", psychoactiveClasses: ["Psychedelic"] },
  { slug: "dmt", name: "DMT", priority: "normal", psychoactiveClasses: ["Psychedelic"] },
  { slug: "obscure-rc", name: "Obscure RC", priority: "low", psychoactiveClasses: ["Psychedelic"] },
  { slug: "mystery", name: "Mystery", priority: "normal", psychoactiveClasses: [] },
  {
    slug: "buried",
    name: "Buried",
    priority: "normal",
    indexCategories: ["Hidden"],
    psychoactiveClasses: ["Stimulant"],
  },
];

describe("buildSubstancePickerItems", () => {
  it("leads with publicly listed articles, then category, then title", () => {
    const items = buildSubstancePickerItems(lookup, new Set(["lsd", "obscure-rc"]));

    expect(items.map((item) => item.slug)).toEqual([
      "mdma", // Entactogen
      "dmt", // Psychedelic
      "lsd",
      "mystery", // uncategorized sorts last inside its tier
      "obscure-rc", // low priority
      "buried", // hidden via index_categories
    ]);
  });

  it("marks depiction rows and article visibility independently", () => {
    const items = buildSubstancePickerItems(lookup, new Set(["lsd", "obscure-rc"]));
    const bySlug = new Map(items.map((item) => [item.slug, item]));

    expect(bySlug.get("lsd")).toMatchObject({ hasOverride: true, publiclyListed: true });
    expect(bySlug.get("obscure-rc")).toMatchObject({ hasOverride: true, publiclyListed: false });
    expect(bySlug.get("dmt")).toMatchObject({ hasOverride: false, publiclyListed: true });
  });

  it("stays usable against a deployment that does not serve the category facets yet", () => {
    const items = buildSubstancePickerItems(
      [
        { slug: "b-substance", name: "B Substance" },
        { slug: "a-substance", name: "A Substance", priority: "low" },
      ],
      new Set(),
    );

    expect(items.map((item) => item.slug)).toEqual(["b-substance", "a-substance"]);
    expect(items[0].category).toBeUndefined();
  });
});

describe("groupMoleculePickerItems", () => {
  it("emits one group per visibility tier and category", () => {
    const groups = groupMoleculePickerItems(
      buildSubstancePickerItems(lookup, new Set()),
    );

    expect(groups.map((group) => group.heading)).toEqual([
      "Entactogen",
      "Psychedelic",
      "Uncategorized",
      "Psychedelic · not publicly listed",
      "Stimulant · not publicly listed",
    ]);
    expect(groups[1].items.map((item) => item.slug)).toEqual(["dmt", "lsd"]);
  });

  it("keeps facet-less class structures in one heading-less group", () => {
    const classes: MoleculePickerItem[] = [
      { slug: "tryptamine", title: "Tryptamine", hasOverride: true },
      { slug: "phenethylamine", title: "Phenethylamine", hasOverride: false },
    ];

    const groups = groupMoleculePickerItems(classes);

    expect(groups).toHaveLength(1);
    expect(groups[0].heading).toBeUndefined();
    expect(groups[0].items).toHaveLength(2);
  });
});
