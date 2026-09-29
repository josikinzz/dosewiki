import { describe, expect, it } from "vitest";
import { buildSearchIndex, type SearchIndexInput } from "./search";
import { buildSearchManifestIndex, createSearchManifest } from "./searchManifest";

const substance = (name: string, slug: string, aliases: string[] = []) => ({
  name,
  slug,
  aliases,
  categories: [],
  heroLabels: [],
  chemicalClasses: [],
  psychoactiveClasses: [],
  mechanismLabels: [],
  mechanismKeywords: [],
});

const bothIndexes = (overrides: Partial<SearchIndexInput> = {}) => {
  const server = buildSearchIndex({
    substances: [],
    categories: [],
    effects: [],
    reports: [],
    profiles: [],
    ...overrides,
  });
  return [server, buildSearchManifestIndex(createSearchManifest(server))];
};

describe("Unicode search identity", () => {
  it("does not discard a meaningful Han prefix from mixed-script queries", () => {
    const indexes = bothIndexes({
      substances: [substance("LSD", "lsd"), substance("5-APB", "5-apb")],
    });

    for (const index of indexes) {
      expect(index.query("不存在LSD")).toEqual([]);
      expect(index.query("咖啡因5")).toEqual([]);
    }
  });

  it("matches full-width Latin names and digits with supported punctuation", () => {
    const indexes = bothIndexes({
      substances: [substance("AL-LAD", "al-lad"), substance("5-APB", "5-apb")],
    });

    for (const index of indexes) {
      expect(index.query("ＡＬ－ＬＡＤ")[0]?.id).toBe("substance:al-lad");
      expect(index.query("５－ＡＰＢ")[0]?.id).toBe("substance:5-apb");
      expect(index.query("allad")[0]?.id).toBe("substance:al-lad");
    }
  });

  it("keeps reports linked through reviewed Han substance aliases", () => {
    const indexes = bothIndexes({
      substances: [substance("Ketamine", "ketamine", ["氯胺酮"])],
      reports: [{
        title: "A quiet evening",
        slug: "quiet-evening",
        author: "A reader",
        substanceNames: ["氯胺酮"],
        introduction: "",
        featured: false,
      }],
    });

    for (const index of indexes) {
      expect(index.query("氯胺酮").map(({ id }) => id)).toEqual([
        "substance:ketamine", "report:quiet-evening",
      ]);
    }
  });

  it("treats Han letters as part of a word when ranking Latin suffixes", () => {
    const indexes = bothIndexes({
      substances: [substance("前LSD", "han-lsd"), substance("Methyl LSD", "methyl-lsd")],
    });

    for (const index of indexes) {
      expect(index.query("lsd").map(({ id }) => id)).toEqual([
        "substance:methyl-lsd", "substance:han-lsd",
      ]);
    }
  });

  it("requires an explicit alias for a different Chinese spelling or transliteration", () => {
    const indexes = bothIndexes({
      substances: [substance("LSD", "lsd", ["麦角酸二乙酰胺"])],
    });

    for (const index of indexes) {
      expect(index.query("麦角酸二乙酰胺")[0]?.id).toBe("substance:lsd");
      expect(index.query("麥角酸二乙醯胺")).toEqual([]);
      expect(index.query("maijiaosuan")).toEqual([]);
    }
  });
});
