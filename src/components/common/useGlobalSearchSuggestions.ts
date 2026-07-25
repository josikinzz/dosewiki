import { useEffect, useState } from "react";
import type { SearchSuggestion } from "../../data/builders/search";

const MAX_SUGGESTIONS = 8;

const searchSuggestionsCache = new Map<string, SearchSuggestion[]>();
const searchSuggestionsInflight = new Map<string, Promise<SearchSuggestion[]>>();

/**
 * Results already fetched for the longest prefix of `trimmed`, if any. Typing one
 * more character can only narrow the result set, so the previous round's results
 * are a good enough stand-in to render immediately instead of flashing an empty
 * or loading state while the request for the longer query is in flight.
 */
const findPrefixSuggestions = (trimmed: string, limit: number): SearchSuggestion[] | undefined => {
  for (let length = trimmed.length - 1; length > 0; length -= 1) {
    const cached = searchSuggestionsCache.get(`${trimmed.slice(0, length).toLowerCase()}::${limit}`);
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

export function useGlobalSearchSuggestions({
  isActiveSearch,
  query,
  limit = MAX_SUGGESTIONS,
}: UseGlobalSearchSuggestionsArgs) {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    const resolvedLimit = Math.min(Math.max(limit, 1), 80);
    const cacheKey = `${trimmed.toLowerCase()}::${resolvedLimit}`;

    if (!trimmed || !isActiveSearch) {
      setSuggestions([]);
      setIsFetchingSuggestions(false);
      return;
    }

    const cachedSuggestions = searchSuggestionsCache.get(cacheKey);
    if (cachedSuggestions) {
      setSuggestions(cachedSuggestions);
      setIsFetchingSuggestions(false);
      return;
    }

    let disposed = false;

    // Render the closest prefix's results right away so the page keeps showing
    // matches while the narrower query resolves, rather than blanking out.
    const prefixSuggestions = findPrefixSuggestions(trimmed, resolvedLimit);
    if (prefixSuggestions) {
      setSuggestions(prefixSuggestions);
    }

    const loadSuggestions = async () => {
      try {
        setIsFetchingSuggestions(!prefixSuggestions);
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

        const nextSuggestions = await request;
        searchSuggestionsCache.set(cacheKey, nextSuggestions);

        if (!disposed) {
          setSuggestions(nextSuggestions);
        }
      } catch {
        if (!disposed) {
          setSuggestions([]);
        }
      } finally {
        if (!disposed) {
          setIsFetchingSuggestions(false);
        }
      }
    };

    void loadSuggestions();

    return () => {
      disposed = true;
    };
  }, [isActiveSearch, limit, query]);

  return { suggestions, isFetchingSuggestions, clearSuggestions: () => setSuggestions([]) };
}
