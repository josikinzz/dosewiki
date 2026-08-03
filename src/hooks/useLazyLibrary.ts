/**
 * Hook for lazy-loading the full library on-demand.
 *
 * This hydrates the `/dev` editor library on demand. It intentionally uses the
 * editor projection so internal metadata such as editorial review notes survives
 * a save/reload cycle.
 */

import { useEffect, useMemo } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { buildLibrary } from "../data/builders/libraryBuilder";
import type { LibraryData } from "../data/SubstanceIndexProvider";
import type { SubstanceArticle } from "../schema";
import { useIndexLayouts } from "./useIndexLayouts";

/**
 * Page size for draining the editor projection. Articles average ~30KB, so
 * each page stays a couple of MB — far inside Convex's per-execution read
 * and time limits, which the old whole-table `getEditorAll` outgrew.
 */
const EDITOR_LIBRARY_PAGE_SIZE = 100;

/**
 * Hook to lazy-load the full library when enabled.
 *
 * @param enabled - Whether to load the library. When false, no query is made.
 * @returns Library data, loading state, and whether library is ready
 */
export function useLazyLibrary(enabled: boolean) {
  const {
    results: convexArticles,
    status,
    loadMore,
  } = usePaginatedQuery(api.substanceIndex.getEditorPage, enabled ? {} : "skip", {
    initialNumItems: EDITOR_LIBRARY_PAGE_SIZE,
  });

  // Drain the table: keep requesting pages until Convex reports exhaustion.
  useEffect(() => {
    if (status === "CanLoadMore") {
      loadMore(EDITOR_LIBRARY_PAGE_SIZE);
    }
  }, [status, loadMore]);

  const isComplete = enabled && status === "Exhausted";

  // Load index layouts from Convex
  const { configs: indexConfigs, isLoading: isLoadingConfigs } = useIndexLayouts(enabled);

  const library = useMemo<LibraryData<SubstanceArticle> | null>(() => {
    // Not enabled - return null
    if (!enabled) {
      return null;
    }

    // Still draining pages from Convex
    if (!isComplete) {
      return null;
    }

    // Loaded but empty - still return null (no point building empty library)
    if (convexArticles.length === 0) {
      return null;
    }

    // Wait for index configs to load
    if (!indexConfigs) {
      return null;
    }

    // Build library with configs from Convex
    return buildLibrary(convexArticles, indexConfigs);
  }, [enabled, isComplete, convexArticles, indexConfigs]);

  return {
    library,
    // isLoading: enabled and either pages or configs still loading
    isLoading: enabled && (!isComplete || isLoadingConfigs),
    // isReady: library has been built successfully
    isReady: library !== null,
    // isEmpty: query completed but returned no data
    isEmpty: isComplete && convexArticles.length === 0,
  };
}
