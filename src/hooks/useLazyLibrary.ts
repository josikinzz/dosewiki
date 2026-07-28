/**
 * Hook for lazy-loading the full library on-demand.
 *
 * This hydrates the `/dev` editor library on demand. It intentionally uses the
 * editor projection so internal metadata such as editorial review notes survives
 * a save/reload cycle.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { buildLibrary } from "../data/builders/libraryBuilder";
import type { LibraryData } from "../data/SubstanceIndexProvider";
import type { SubstanceArticle } from "../schema";
import { useIndexLayouts } from "./useIndexLayouts";

/**
 * Hook to lazy-load the full library when enabled.
 *
 * @param enabled - Whether to load the library. When false, no query is made.
 * @returns Library data, loading state, and whether library is ready
 */
export function useLazyLibrary(enabled: boolean) {
  const convexArticles = useQuery(
    api.substanceIndex.getEditorAll,
    enabled ? {} : "skip"
  );

  // Load index layouts from Convex
  const { configs: indexConfigs, isLoading: isLoadingConfigs } = useIndexLayouts(enabled);

  const library = useMemo<LibraryData<SubstanceArticle> | null>(() => {
    // Not enabled - return null
    if (!enabled) {
      return null;
    }

    // Still loading from Convex (undefined means query in progress)
    if (convexArticles === undefined) {
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
  }, [enabled, convexArticles, indexConfigs]);

  return {
    library,
    // isLoading: enabled and either articles or configs still loading
    isLoading: enabled && (convexArticles === undefined || isLoadingConfigs),
    // isReady: library has been built successfully
    isReady: library !== null,
    // isEmpty: query completed but returned no data
    isEmpty: enabled && convexArticles !== undefined && convexArticles.length === 0,
  };
}
