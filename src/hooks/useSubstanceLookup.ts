import { useEffect } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const SUBSTANCE_LOOKUP_PAGE_SIZE = 32;

/**
 * Drain the bounded editor lookup projection while preserving the old lookup's
 * all-or-loading contract. Convex accumulates pages in stable table order.
 * Query failures intentionally propagate through the normal Convex hook path.
 */
export function useSubstanceLookup(enabled = true) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.substanceIndex.getLookupPage,
    enabled ? {} : "skip",
    { initialNumItems: SUBSTANCE_LOOKUP_PAGE_SIZE },
  );

  useEffect(() => {
    if (enabled && status === "CanLoadMore") {
      loadMore(SUBSTANCE_LOOKUP_PAGE_SIZE);
    }
  }, [enabled, loadMore, status]);

  const isComplete = enabled && status === "Exhausted";

  return {
    lookup: isComplete ? results : undefined,
    isLoading: enabled && !isComplete,
    status,
  };
}
