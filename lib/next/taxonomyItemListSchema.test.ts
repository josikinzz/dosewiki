import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import { describe, expect, it } from "vitest";
import {
  buildCategoryItemListSchema,
  buildEffectCategoryItemListSchema,
  buildMechanismQualifierItemListSchema,
} from "./taxonomyItemListSchema";
import { getPublicSite } from "./publicSite";

/** Pinned to dose.wiki so the assertions hold on an Effect Index build too. */
const DOSEWIKI_SITE = getPublicSite(SITE_FLAVOR_CONFIGS.dosewiki, {});

describe("taxonomy item list schema", () => {
  it("builds deduped category substance ItemLists with canonical public URLs", () => {
    const schema = buildCategoryItemListSchema(
      {
        definition: {
          key: "psychedelic",
          name: "Psychedelic",
          icon: "lucide:sparkles",
        },
        total: 2,
        groups: [
          {
            name: "Common",
            drugs: [
              { name: "LSD", slug: "lsd" },
              { name: "LSD", slug: "lsd" },
              { name: "Psilocybin Mushrooms", slug: "psilocybin-mushrooms" },
            ],
          },
        ],
      },
      { family: "category", params: { categoryKey: "psychedelic" } },
      DOSEWIKI_SITE,
    );

    expect(schema["@type"]).toBe("ItemList");
    expect(schema.url).toBe("https://dose.wiki/category/psychedelic");
    expect(schema.numberOfItems).toBe(2);
    expect(schema.itemListElement.map((item) => item.url)).toEqual([
      "https://dose.wiki/lsd",
      "https://dose.wiki/psilocybin-mushrooms",
    ]);
  });

  it("builds mechanism qualifier ItemLists from the active qualifier groups", () => {
    const mechanism = {
      definition: {
        name: "5-HT2A receptor agonist",
        slug: "5-ht2a-receptor-agonist",
        total: 2,
      },
      defaultQualifierKey: "unqualified",
      qualifiers: [],
    };
    const qualifier = {
      key: "full",
      label: "full",
      total: 1,
      groups: [
        {
          key: "psychedelic",
          name: "Psychedelic",
          icon: "lucide:sparkles",
          total: 1,
          drugs: [{ name: "DOB", slug: "dob" }],
        },
      ],
    };

    const schema = buildMechanismQualifierItemListSchema(
      mechanism,
      qualifier,
      {
        family: "mechanismQualifier",
        params: { mechanismSlug: "5-ht2a-receptor-agonist", qualifierSlug: "full" },
      },
      DOSEWIKI_SITE,
    );

    expect(schema.url).toBe(
      "https://dose.wiki/mechanism/5-ht2a-receptor-agonist/full",
    );
    expect(schema.name).toBe("dose.wiki 5-HT2A receptor agonist full substances");
    expect(schema.itemListElement).toHaveLength(1);
    expect(schema.itemListElement[0]).toMatchObject({
      name: "DOB",
      url: "https://dose.wiki/dob",
    });
  });

  it("builds effect category ItemLists with effect routes", () => {
    const schema = buildEffectCategoryItemListSchema({
      categoryName: "Visual Effects",
      categorySlug: "visual-effects",
      description: "Effects that alter visual perception.",
      effects: [
        {
          name: "Colour enhancement",
          slug: "colour-enhancement",
          summary: "Colours appear richer.",
          featured: false,
          tags: ["visual"],
        },
      ],
      route: { family: "effectCategory", params: { categorySlug: "visual-effects" } },
    }, DOSEWIKI_SITE);

    expect(schema.url).toBe(
      "https://dose.wiki/effects/category/visual-effects",
    );
    expect(schema.itemListElement[0]).toMatchObject({
      name: "Colour enhancement",
      url: "https://dose.wiki/effects/colour-enhancement",
    });
  });
});
