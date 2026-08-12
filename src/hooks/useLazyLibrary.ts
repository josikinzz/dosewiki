/**
 * Hook for lazy-loading the editor library on-demand.
 *
 * This hydrates the `/dev` and `/review` editor library. It intentionally uses
 * the editor projection so internal metadata such as editorial review notes
 * survives a save/reload cycle.
 *
 * What it drains is the *slim list* projection, not whole articles: the corpus
 * is ~16.7 MB of prose and references, and none of it is read across every row.
 * Rows arrive carrying identity, taxonomy, mechanism tags, effect names, and
 * review state, and are expanded here into structurally whole articles with
 * empty bodies. Filling those bodies in is `useDevArticleHydration`'s job —
 * per article on selection, or the whole corpus for the two tools that sweep
 * article bodies.
 */

import { useEffect, useMemo, useState } from "react";
import { buildLibrary } from "../data/builders/libraryBuilder";
import { createEmptyArticle } from "../data/schema/defaults.generated";
import type { LibraryData } from "../data/SubstanceIndexProvider";
import type { SubstanceArticle } from "../schema";
import { useIndexLayouts } from "./useIndexLayouts";

/**
 * Server-side drain endpoint. The editor projections carry editor-only state
 * and therefore require an editor actor on the Convex side; the browser holds
 * no admin intent token, so the page walk happens behind the editor-session-
 * guarded Next route instead of over the browser Convex socket.
 */
const EDITOR_LIBRARY_ENDPOINT = "/api/dev/editor-library";

/** The library list projection: the fields, and only the fields, every row is read for. */
type EditorLibraryEntry = Partial<SubstanceArticle> & { slug?: string };

type EditorLibraryPayload = { articles?: EditorLibraryEntry[] };

/**
 * Give a slim row the shape of a whole article.
 *
 * Everything downstream — `buildLibrary`, the pickers, the working set, the
 * save diff — is typed on `SubstanceArticle`, and an empty section reads the
 * same as an absent one to all of them. Spreading over the schema's own empty
 * article is what keeps a slim row a legal article rather than a partial one.
 */
function expandEditorLibraryEntry(entry: EditorLibraryEntry): SubstanceArticle {
  return { ...createEmptyArticle(), ...entry } as SubstanceArticle;
}

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
        setConvexArticles((payload?.articles ?? []).map(expandEditorLibraryEntry));
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
