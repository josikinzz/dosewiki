import { describe, expect, it } from "vitest";
import { buildSearchIndex, type SearchIndexInput } from "./search";
import { buildSearchManifestIndex, createSearchManifest } from "./searchManifest";

const createInput = (overrides: Partial<SearchIndexInput> = {}): SearchIndexInput => ({
  substances: [],
  categories: [],
  effects: [],
  reports: [],
  profiles: [],
  ...overrides,
});

const substance = (
  name: string,
  slug: string,
  options: { aliases?: string[]; subtitle?: string; chemicalClasses?: string[] } = {},
) => ({
  name,
  slug,
  aliases: options.aliases ?? [],
  categories: [],
  heroLabels: [],
  chemicalClasses: options.chemicalClasses ?? [],
  psychoactiveClasses: [],
  subtitle: options.subtitle,
  mechanismLabels: [],
  mechanismKeywords: [],
});

const buildBoth = (input: SearchIndexInput) => {
  const index = buildSearchIndex(input);
  return { index, manifest: buildSearchManifestIndex(createSearchManifest(index)) };
};

describe("createSearchManifest", () => {
  it("carries names and aliases but not keywords", () => {
    const index = buildSearchIndex(
      createInput({
        substances: [
          substance("MDMA", "mdma", { aliases: ["Molly"], chemicalClasses: ["Phenethylamine"] }),
        ],
      }),
    );

    const manifest = createSearchManifest(index);
    const [entry] = manifest.entries;

    expect(entry).toMatchObject({ id: "substance:mdma", label: "MDMA", aliases: ["Molly"] });
    expect(entry).not.toHaveProperty("keywords");
    // The class is reachable on the server but is exactly the kind of bulk the
    // manifest exists to leave behind.
    expect(JSON.stringify(manifest)).not.toContain("Phenethylamine");
  });

  it("versions on the index input hash so content changes retire cached copies", () => {
    const first = buildSearchIndex(createInput({ substances: [substance("LSD", "lsd")] }));
    const second = buildSearchIndex(createInput({ substances: [substance("MDMA", "mdma")] }));

    expect(createSearchManifest(first).version).toBe(first.metadata.inputHash);
    expect(createSearchManifest(first).version).not.toBe(createSearchManifest(second).version);
  });

  it("trims preview text to what a clamped two-line preview can show", () => {
    const longSubtitle = "a".repeat(600);
    const index = buildSearchIndex(
      createInput({ substances: [substance("DMT", "dmt", { subtitle: longSubtitle })] }),
    );

    const [entry] = createSearchManifest(index).entries;

    expect(entry.secondary).toHaveLength(281);
    expect(entry.secondary?.endsWith("…")).toBe(true);
  });
});

describe("buildSearchManifestIndex", () => {
  it("ranks name and alias matches exactly as the server index does", () => {
    const { index, manifest } = buildBoth(
      createInput({
        substances: [
          substance("ETH-LAD", "eth-lad"),
          substance("Ethylone", "ethylone"),
          substance("AL-LAD", "al-lad"),
          substance("Alcohol", "alcohol", { aliases: ["Ethanol"] }),
          substance("Ethylphenidate", "ethylphenidate"),
        ],
      }),
    );

    for (const query of ["eth", "lad", "ethanol", "al-lad"]) {
      const serverIds = index.query(query, { limit: 10 }).map((match) => match.id);
      const localIds = manifest.query(query, { limit: 10 }).map((match) => match.id);
      expect(localIds, `query: ${query}`).toEqual(serverIds);
    }
  });

  it("matches compact queries from load-time derivation, not manifest payload", () => {
    const { index, manifest } = buildBoth(
      createInput({
        substances: [
          substance("AL-LAD", "al-lad"),
          substance("1cP-AL-LAD", "1cp-al-lad"),
          substance("2C-B", "2c-b"),
          substance("ETH-LAD", "eth-lad"),
          substance("Hydromorphone", "hydromorphone", { aliases: ["Palladone"] }),
        ],
      }),
    );

    // The serialized payload stays free of the derived compact forms.
    const payload = createSearchManifest(index);
    expect(JSON.stringify(payload)).not.toContain("1cpallad");

    expect(manifest.query("allad").map((match) => match.label)).toEqual([
      "AL-LAD",
      "Hydromorphone",
    ]);
    expect(manifest.query("1cpallad")[0]?.label).toBe("1cP-AL-LAD");
    expect(manifest.query("2cb")[0]?.label).toBe("2C-B");
    expect(manifest.query("ethlad")[0]?.label).toBe("ETH-LAD");

    for (const query of ["allad", "1cpallad", "2cb", "ethlad"]) {
      const serverIds = index.query(query, { limit: 10 }).map((match) => match.id);
      const localIds = manifest.query(query, { limit: 10 }).map((match) => match.id);
      expect(localIds, `query: ${query}`).toEqual(serverIds);
    }
  });

  it("matches across accents in either direction", () => {
    const { manifest } = buildBoth(
      createInput({ substances: [substance("Peyoté", "peyote", { aliases: ["Híkuri"] })] }),
    );

    expect(manifest.query("peyote").map((match) => match.slug)).toEqual(["peyote"]);
    expect(manifest.query("peyoté").map((match) => match.slug)).toEqual(["peyote"]);
    expect(manifest.query("hikuri").map((match) => match.slug)).toEqual(["peyote"]);
  });

  it("finds reports through the aliases of the substances they cover", () => {
    const { manifest } = buildBoth(
      createInput({
        substances: [substance("MDMA", "mdma", { aliases: ["Molly"] })],
        reports: [
          {
            title: "A long night",
            slug: "a-long-night",
            author: "anon",
            substanceNames: ["MDMA"],
            introduction: "",
            featured: false,
          },
        ],
      }),
    );

    const ids = manifest.query("molly", { limit: 10 }).map((match) => match.id);
    expect(ids).toContain("report:a-long-night");
  });

  it("does not match across two adjacent names", () => {
    const { manifest } = buildBoth(
      createInput({
        substances: [substance("MDMA", "mdma", { aliases: ["Molly", "Sass"] })],
      }),
    );

    // "mollysass" spans the alias boundary and must not be treated as a hit.
    expect(manifest.query("mollysass")).toEqual([]);
  });

  it("returns nothing rather than everything for an empty query", () => {
    const { manifest } = buildBoth(
      createInput({ substances: [substance("MDMA", "mdma")] }),
    );

    expect(manifest.query("")).toEqual([]);
    expect(manifest.query("   ")).toEqual([]);
  });

  it("respects the result limit", () => {
    const { manifest } = buildBoth(
      createInput({
        substances: Array.from({ length: 12 }, (_, i) => substance(`Test ${i}`, `test-${i}`)),
      }),
    );

    expect(manifest.query("test", { limit: 5 })).toHaveLength(5);
  });
});
