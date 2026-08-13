import { useCallback, useEffect, useMemo, useState } from "react";
import type { SearchSuggestion } from "../../data/builders/search";
import { useSearchManifestIndex } from "../../hooks/useSearchManifest";

const MAX_SUGGESTIONS = 8;

/**
 * How long to wait before asking the server to refine local results.
 *
 * The manifest is preloaded during idle time, so local matching answers the
 * keystroke and this delay is invisible; it exists to collapse a burst of
 * typing into one request. It applies even before the manifest has landed —
 * firing per keystroke there would burn through the endpoint's rate limit
 * (30/min/IP) during the brief window the manifest is still downloading.
 */
const SERVER_REFINE_DELAY_MS = 400;

const searchSuggestionsCache = new Map<string, SearchSuggestion[]>();
const searchSuggestionsInflight = new Map<string, Promise<SearchSuggestion[]>>();

const buildCacheKey = (trimmed: string, limit: number) =>
  `${trimmed.toLowerCase()}::${limit}`;

/** Test seam: forget every cached and in-flight suggestion response. */
export function resetSearchSuggestionsCacheForTests() {
  searchSuggestionsCache.clear();
  searchSuggestionsInflight.clear();
}

/**
 * Results already fetched for the longest prefix of `trimmed`, if any. Typing one
 * more character can only narrow the result set, so the previous round's results
 * are a good enough stand-in to render immediately instead of flashing an empty
 * or loading state while the request for the longer query is in flight.
 */
const findPrefixSuggestions = (trimmed: string, limit: number): SearchSuggestion[] | undefined => {
  for (let length = trimmed.length - 1; length > 0; length -= 1) {
    const cached = searchSuggestionsCache.get(buildCacheKey(trimmed.slice(0, length), limit));
    if (cached) {
      return cached;
    }
  }
  return undefined;
};

type UseGlobalSearchSuggestionsArgs = {
  isActiveSearch: boolean;
  query: string;
  limit?: number;
};

/**
 * Search results for `query`, answered locally first and refined by the server.
 *
 * The manifest covers names and aliases, which is what nearly every query is,
 * and matches with no network in the loop. The server request that follows adds
 * what the manifest deliberately omits — matches on classes, mechanisms and
 * article prose — and replaces the local results once it lands.
 */
export function useGlobalSearchSuggestions({
  isActiveSearch,
  query,
  limit = MAX_SUGGESTIONS,
}: UseGlobalSearchSuggestionsArgs) {
  const trimmed = query.trim();
  const resolvedLimit = Math.min(Math.max(limit, 1), 80);
  const isSearching = isActiveSearch && trimmed.length > 0;
  const cacheKey = buildCacheKey(trimmed, resolvedLimit);

  const manifestIndex = useSearchManifestIndex(isActiveSearch);
  const [serverResults, setServerResults] = useState<{
    key: string;
    results: SearchSuggestion[];
  } | null>(null);
  const [isRequestInFlight, setIsRequestInFlight] = useState(false);
  const [isCleared, setIsCleared] = useState(false);

  // Synchronous: when the manifest is loaded there is no state round trip
  // between a keystroke and its results.
  const localResults = useMemo(() => {
    if (!manifestIndex || !isSearching) {
      return null;
    }
    return manifestIndex.query(trimmed, { limit: resolvedLimit });
  }, [manifestIndex, isSearching, trimmed, resolvedLimit]);

  useEffect(() => {
    setIsCleared(false);
  }, [trimmed, isActiveSearch]);

  useEffect(() => {
    if (!isSearching) {
      setIsRequestInFlight(false);
      return;
    }

    const cached = searchSuggestionsCache.get(cacheKey);
    if (cached) {
      setServerResults({ key: cacheKey, results: cached });
      setIsRequestInFlight(false);
      return;
    }

    let disposed = false;
    setIsRequestInFlight(true);

    const runRequest = async () => {
      try {
        let request = searchSuggestionsInflight.get(cacheKey);

        if (!request) {
          request = fetch(
            `/api/search-suggestions?q=${encodeURIComponent(trimmed)}&limit=${resolvedLimit}`,
          )
            .then(async (response) => {
              if (!response.ok) {
                throw new Error(`Suggestion request failed: ${response.status}`);
              }

              const data = (await response.json()) as { results?: SearchSuggestion[] };
              return data.results ?? [];
            })
            .finally(() => {
              searchSuggestionsInflight.delete(cacheKey);
            });

          searchSuggestionsInflight.set(cacheKey, request);
        }

        const nextResults = await request;
        searchSuggestionsCache.set(cacheKey, nextResults);

        if (!disposed) {
          setServerResults({ key: cacheKey, results: nextResults });
        }
      } catch {
        // Local results, if any, stay on screen; a failed refinement should not
        // blank out matches the browser already found.
        if (!disposed) {
          setServerResults(null);
        }
      } finally {
        if (!disposed) {
          setIsRequestInFlight(false);
        }
      }
    };

    const timer = setTimeout(() => {
      void runRequest();
    }, SERVER_REFINE_DELAY_MS);

    return () => {
      disposed = true;
      clearTimeout(timer);
    };
    // `localResults` is deliberately not a dependency: it is derived from the
    // query and limit already listed, and re-running when the manifest
    // finishes loading would fire a second request for a query the first one
    // already covers.
  }, [cacheKey, isSearching, resolvedLimit, trimmed]);

  const clearSuggestions = useCallback(() => {
    setIsCleared(true);
  }, []);

  const suggestions = useMemo(() => {
    if (!isSearching || isCleared) {
      return [];
    }
    if (serverResults?.key === cacheKey) {
      return serverResults.results;
    }
    return localResults ?? findPrefixSuggestions(trimmed, resolvedLimit) ?? [];
  }, [
    cacheKey,
    isCleared,
    isSearching,
    localResults,
    resolvedLimit,
    serverResults,
    trimmed,
  ]);

  return {
    suggestions,
    // Only a genuinely empty screen counts as loading; once anything is
    // rendered, refinement happens silently underneath it.
    isFetchingSuggestions: isRequestInFlight && suggestions.length === 0 && !isCleared,
    clearSuggestions,
  };
}
