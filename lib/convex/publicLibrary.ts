import "server-only";

import { cache } from "react";
import { buildLibrary } from "../../src/data/builders/libraryBuilder";
import { parseManualConfig } from "../../src/data/builders/manualIndexLoader";
import type { LibraryData } from "../../src/data/SubstanceIndexProvider";
import { querySearchWithData } from "../../src/data/builders/search";
import { getIndexLayoutByType, getRawSubstances, type IndexLayoutType } from "./publicData";

const EMPTY_LAYOUT = {
  version: 1,
  categories: [
    {
      key: "miscellaneous",
      label: "Miscellaneous",
      iconKey: "miscellaneous",
      drugs: [],
      sections: [],
    },
  ],
};

async function getNormalizedLayout(type: IndexLayoutType) {
  const layout = await getIndexLayoutByType(type);
  return parseManualConfig(layout ?? EMPTY_LAYOUT);
}

export const getPublicLibrary = cache(async (): Promise<LibraryData> => {
  const [articles, psychoactive, chemical, mechanism] = await Promise.all([
    getRawSubstances(),
    getNormalizedLayout("psychoactive"),
    getNormalizedLayout("chemical"),
    getNormalizedLayout("mechanism"),
  ]);

  return buildLibrary(articles, {
    psychoactive,
    chemical,
    mechanism,
  });
});

export const getPublicSearchMatches = cache(async (query: string, limit = 20) => {
  const library = await getPublicLibrary();
  return querySearchWithData(query, library, limit);
});
