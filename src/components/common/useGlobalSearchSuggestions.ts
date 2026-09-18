import { useCallback, useEffect, useMemo, useState } from "react";
import type { SearchSuggestion } from "../../data/builders/search";
import { useUiLocale } from "../../i18n/client";
import { useSearchManifestIndex } from "../../hooks/useSearchManifest";

const MAX_SUGGESTIONS = 8;

/**
 * How long to wait before asking the server to refine local results.
 *
 * The manifest starts on search intent, so this delay collapses a burst of
 * typing while the shared locale-specific index is still downloading. It also
 * avoids burning through the endpoint's rate limit (30/min/IP) during that
 * brief window.
 */
const SERVER_REFINE_DELAY_MS = 400;

const SEARCH_SUGGESTIONS_MAX_ENTRIES = 100;
const SEARCH_SUGGESTIONS_TTL_MS = 5 * 60 * 1000;
const searchSuggestionsCache = new Map<string, {
  results: SearchSuggestion[];
  expiresAt: number;
}>();
const searchSuggestionsInflight = new Map<string, Promise<SearchSuggestion[]>>();

const buildCacheKey = (trimmed: string, limit: number, locale: string) =>
  `${locale}::${trimmed.toLowerCase()}::${limit}`;

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
const findPrefixSuggestions = (
  trimmed: string,
  limit: number,
  locale: string,
): SearchSuggestion[] | undefined => {
  for (let length = trimmed.length - 1; length > 0; length -= 1) {
    const cached = searchSuggestionsCache.get(
      buildCacheKey(trimmed.slice(0, length), limit, locale),
    );
    if (cached) {
      return cached.results;
    }
  }
  return undefined;
};

type UseGlobalSearchSuggestionsArgs = {
  isActiveSearch: boolean;
  query: string;
  limit?: number;
  initialResults?: SearchSuggestion[];
  initialQuery?: string;
  loadManifestOnActivate?: boolean;
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
  initialResults = [],
  initialQuery = "",
  loadManifestOnActivate = true,
}: UseGlobalSearchSuggestionsArgs) {
  const locale = useUiLocale();
  const trimmed = query.trim();
  const resolvedLimit = Math.min(Math.max(limit, 1), 80);
  const isSearching = isActiveSearch && trimmed.length > 0;
  const cacheKey = buildCacheKey(trimmed, resolvedLimit, locale);

  const manifestIndex = useSearchManifestIndex(isActiveSearch, locale, loadManifestOnActivate);
  const [serverResults, setServerResults] = useState<{
    key: string;
    results: SearchSuggestion[];
  } | null>(null);
  const [requestState, setRequestState] = useState<{ key: string; pending: boolean } | null>(null);
  const [isCleared, setIsCleared] = useState(false);
  const initialCacheKey = buildCacheKey(initialQuery.trim(), resolvedLimit, locale);
  const seededResults =
    initialResults.length > 0 && cacheKey === initialCacheKey ? initialResults : undefined;

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
      setRequestState(null);
      return;
    }

    const cached = searchSuggestionsCache.get(cacheKey);
    if (cached) {
      setServerResults({ key: cacheKey, results: cached.results });
      if (cached.expiresAt > Date.now()) {
        setRequestState({ key: cacheKey, pending: false });
        return;
      }
    }

    let disposed = false;
    setRequestState({ key: cacheKey, pending: true });

    const runRequest = async () => {
      try {
        let request = searchSuggestionsInflight.get(cacheKey);

        if (!request) {
          request = fetch(
            `/api/search-suggestions?q=${encodeURIComponent(trimmed)}&limit=${resolvedLimit}&locale=${encodeURIComponent(locale)}`,
          )
            .then(async (response) => {
              if (!response.ok) {
                throw new Error(`Suggestion request failed: ${response.status}`);
              }

              const data = (await response.json()) as { results?: SearchSuggestion[] };
              const results = data.results ?? [];
              searchSuggestionsCache.delete(cacheKey);
              searchSuggestionsCache.set(cacheKey, {
                results,
                expiresAt: Date.now() + SEARCH_SUGGESTIONS_TTL_MS,
              });
              while (searchSuggestionsCache.size > SEARCH_SUGGESTIONS_MAX_ENTRIES) {
                searchSuggestionsCache.delete(searchSuggestionsCache.keys().next().value!);
              }
              return results;
            })
            .finally(() => {
              searchSuggestionsInflight.delete(cacheKey);
            });

          searchSuggestionsInflight.set(cacheKey, request);
        }

        const nextResults = await request;

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
          setRequestState({ key: cacheKey, pending: false });
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
  }, [cacheKey, isSearching, locale, resolvedLimit, trimmed]);

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
    return searchSuggestionsCache.get(cacheKey)?.results ?? localResults ?? seededResults ?? findPrefixSuggestions(trimmed, resolvedLimit, locale) ?? [];
  }, [
    cacheKey,
    isCleared,
    isSearching,
    seededResults,
    locale,
    resolvedLimit,
    serverResults,
    trimmed,
  ]);

  // Include the render before the request effect starts, without treating a
  // cached answer as pending or borrowing another query's request status.
  const isUpdatingSuggestions =
    isSearching &&
    !isCleared &&
    (searchSuggestionsCache.get(cacheKey)?.expiresAt ?? 0) <= Date.now() &&
    (requestState?.key !== cacheKey || requestState.pending);

  return {
    suggestions,
    isUpdatingSuggestions,
    isFetchingSuggestions: isUpdatingSuggestions && suggestions.length === 0,
    clearSuggestions,
  };
}
