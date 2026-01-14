import { describe, it, expect } from "vitest";
import { querySearchWithData } from "./search";

const createRecord = (name: string, slug: string, categories: string[] = []) => ({
  name,
  slug,
  aliases: [],
  chemicalClasses: [],
  psychoactiveClasses: [],
  content: {
    categories,
    heroBadges: [],
    infoSections: [],
    subtitle: "",
  },
});

const createLibrary = (records: ReturnType<typeof createRecord>[]) => ({
  substanceRecords: records,
  dosageCategoryGroups: records.map((record) => ({
    key: record.slug,
    name: record.name,
    total: 1,
  })),
  effectSummaries: [],
  findCategoryByKey: (key: string) => ({
    key,
    name: key,
    aliases: [],
  }),
});

describe("querySearchWithData", () => {
  it("returns matches for the current library and query", () => {
    const libraryA = createLibrary([createRecord("LSD", "lsd", ["Psychedelic"])]);
    const libraryB = createLibrary([createRecord("MDMA", "mdma", ["Entactogen"])]);

    const lsdResults = querySearchWithData("lsd", libraryA);
    expect(lsdResults[0]?.label).toBe("LSD");
    expect(lsdResults[0]?.type).toBe("substance");

    const mdmaResults = querySearchWithData("mdma", libraryB);
    expect(mdmaResults[0]?.label).toBe("MDMA");
    expect(mdmaResults[0]?.type).toBe("substance");
  });
});
