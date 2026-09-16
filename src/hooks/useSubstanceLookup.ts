import { useEditorDrainedRead } from "./useEditorRead";

/**
 * The route clamps pages at 200 rows, so the whole corpus lands in a few
 * keyset round trips and each 15 s refresh replays only those.
 */
const SUBSTANCE_LOOKUP_PAGE_SIZE = 200;

/**
 * Drain the bounded editor lookup projection while preserving the old lookup's
 * all-or-loading contract: pages accumulate in stable table order and
 * `lookup` stays `undefined` until the last one lands. Query failures
 * propagate through render exactly as the Postgres hook's did.
 */
export function useSubstanceLookup(enabled = true) {
  const { results, status } = useEditorDrainedRead(
    "substanceIndex:getLookupPage",
    enabled ? {} : "skip",
    { initialNumItems: SUBSTANCE_LOOKUP_PAGE_SIZE },
  );

  return {
    lookup: results,
    isLoading: enabled && results === undefined,
    status,
  };
}
