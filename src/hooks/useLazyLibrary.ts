/**
 * Hook for lazy-loading the full library on-demand.
 *
 * This hydrates the `/dev` editor library on demand. It intentionally uses the
 * editor projection so internal metadata such as editorial review notes survives
 * a save/reload cycle.
 */

import { useEffect, useMemo, useState } from "react";
import { buildLibrary } from "../data/builders/libraryBuilder";
import type { LibraryData } from "../data/SubstanceIndexProvider";
import type { SubstanceArticle } from "../schema";
import { useIndexLayouts } from "./useIndexLayouts";

/**
 * Server-side drain endpoint. `substanceIndex.getEditorPage` carries
 * editor-only state and therefore requires an editor actor on the Convex side;
 * the browser holds no admin intent token, so the page walk happens behind the
 * editor-session-guarded Next route instead of over the browser Convex socket.
 */
const EDITOR_LIBRARY_ENDPOINT = "/api/dev/editor-library";

type EditorLibraryPayload = { articles?: SubstanceArticle[] };

/**
 * Hook to lazy-load the full library when enabled.
 *
 * @param enabled - Whether to load the library. When false, no query is made.
 * @returns Library data, loading state, and whether library is ready
 */
export function useLazyLibrary(enabled: boolean) {
  const [convexArticles, setConvexArticles] = useState<SubstanceArticle[] | null>(null);

  useEffect(() => {
    if (!enabled) {
      setConvexArticles(null);
      return;
    }

    let cancelled = false;

    void fetch(EDITOR_LIBRARY_ENDPOINT)
      .then((response) => (response.ok ? (response.json() as Promise<EditorLibraryPayload>) : null))
      .then((payload) => {
        if (cancelled) return;
        setConvexArticles(payload?.articles ?? []);
      })
      .catch(() => {
        if (!cancelled) setConvexArticles([]);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const isComplete = enabled && convexArticles !== null;

  // Load index layouts from Convex
  const { configs: indexConfigs, isLoading: isLoadingConfigs } = useIndexLayouts(enabled);

  const library = useMemo<LibraryData<SubstanceArticle> | null>(() => {
    // Not enabled - return null
    if (!enabled) {
      return null;
    }

    // Still draining pages from Convex
    if (!isComplete || convexArticles === null) {
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
    isEmpty: isComplete && (convexArticles?.length ?? 0) === 0,
  };
}
