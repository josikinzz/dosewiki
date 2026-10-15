import { buildLibrary, type IndexConfigs } from "./builders/libraryBuilder";
import type { NormalizedManualIndexConfig } from "./builders/manualIndexLoader";
import type { LibraryData } from "./SubstanceIndexProvider";
import type { SubstanceArticle } from "../schema";

const EMPTY_MANUAL_CONFIG: NormalizedManualIndexConfig = {
  version: 0,
  categories: [],
  categoryMap: new Map(),
};

const EMPTY_INDEX_CONFIGS: IndexConfigs = {
  psychoactive: EMPTY_MANUAL_CONFIG,
  chemical: EMPTY_MANUAL_CONFIG,
  mechanism: EMPTY_MANUAL_CONFIG,
};

let cachedEmptyLibrary: LibraryData<SubstanceArticle> | null = null;

export function getEmptyEditorLibrary(): LibraryData<SubstanceArticle> {
  cachedEmptyLibrary ??= buildLibrary<SubstanceArticle>([], EMPTY_INDEX_CONFIGS);
  return cachedEmptyLibrary;
}
