/**
 * Placeholder library used while the editor corpus is still draining.
 *
 * The `/dev` shell mounts its providers before every article has arrived so the
 * tab rail and the library-independent tools render immediately. Tools that do
 * need the corpus read the loading flag threaded alongside this value rather
 * than the article count, so an empty library is never mistaken for real data.
 */

import { buildLibrary, type IndexConfigs } from "./builders/libraryBuilder";
import type { NormalizedManualIndexConfig } from "./builders/manualIndexLoader";
import type { LibraryData } from "./SubstanceIndexProvider";
import type { SubstanceArticle } from "../schema";

// Built by hand rather than through `parseManualConfig`, which rejects a
// category-less config as malformed input. Nothing renders from this shape; it
// only has to satisfy the builder while the real layouts are in flight.
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

/** Build (once) the empty editor library shared by every placeholder render. */
export function getEmptyEditorLibrary(): LibraryData<SubstanceArticle> {
  cachedEmptyLibrary ??= buildLibrary<SubstanceArticle>([], EMPTY_INDEX_CONFIGS);
  return cachedEmptyLibrary;
}
