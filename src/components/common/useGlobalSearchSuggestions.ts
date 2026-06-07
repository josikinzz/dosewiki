import { useEffect, useState } from "react";
import type { SearchMatch } from "../../data/builders/search";

const MAX_SUGGESTIONS = 8;

const searchSuggestionsCache = new Map<string, SearchMatch[]>();
const searchSuggestionsInflight = new Map<string, Promise<SearchMatch[]>>();

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
  const [suggestions, setSuggestions] = useState<SearchMatch[]>([]);
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

    const loadSuggestions = async () => {
      try {
        setIsFetchingSuggestions(true);
        let request = searchSuggestionsInflight.get(cacheKey);

        if (!request) {
          request = fetch(
            `/api/search-suggestions?q=${encodeURIComponent(trimmed)}&limit=${resolvedLimit}`,
          )
            .then(async (response) => {
              if (!response.ok) {
                throw new Error(`Suggestion request failed: ${response.status}`);
              }

              const data = (await response.json()) as { results?: SearchMatch[] };
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
