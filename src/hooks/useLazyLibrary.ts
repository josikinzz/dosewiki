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
 * empty bodies. Filling those bodies in is `useDevArticleHydration`'s job: one
 * slug at a time on selection, or a bounded batch of exactly the rows a tag
 * rewrite is about to touch. The tag editor lists and plans from its own
 * registry projection, so nothing ever drains the whole corpus.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { buildLibrary } from "../data/builders/libraryBuilder";
import { createEmptyArticle } from "../data/schema/defaults.generated";
import type { LibraryData } from "../data/SubstanceIndexProvider";
import type { SubstanceArticle } from "../schema";
import { useIndexLayouts } from "./useIndexLayouts";

/**
 * Server-side drain endpoint. The editor projections carry editor-only state
 * and therefore require an editor actor on the Postgres side; the browser holds
 * no admin intent token, so the page walk happens behind the editor-session-
 * guarded Next route instead of over the browser Postgres socket.
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
  const session = useSession();
  const readerIdentity = session.status === "authenticated"
    ? session.data?.user?.email?.trim().toLowerCase() ?? null
    : null;
  const [requested, setRequested] = useState(false);
  const active = enabled || requested;
  const [dataArticles, setDataArticles] = useState<SubstanceArticle[] | null>(null);
  const [dataIdentity, setDataIdentity] = useState<string | null>(null);
  const waiters = useRef<Array<{ identity: string | null; resolve: () => void; reject: (error: Error) => void }>>([]);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [corpusSettled, setCorpusSettled] = useState(false);
  const [reloadGeneration, setReloadGeneration] = useState(0);
  useEffect(() => {
    if (!active || !readerIdentity) {
      setDataArticles(null);
      setDataIdentity(null);
      setCorpusSettled(false);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setLoadError(null);
    setCorpusSettled(false);

    void fetch(EDITOR_LIBRARY_ENDPOINT, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as EditorLibraryPayload | { error?: unknown } | null;
        if (!response.ok) {
          const message = payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `Editor library read failed (${response.status}).`;
          throw new Error(message);
        }
        if (!payload || !("articles" in payload) || !Array.isArray(payload.articles)) {
          throw new Error("The editor library response is incomplete.");
        }
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        setDataArticles(payload.articles.map(expandEditorLibraryEntry));
        setDataIdentity(readerIdentity);
        setCorpusSettled(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // A failed first read has no corpus baseline. A failed refresh must not
        // erase the last successful data while the UI reports the error.
        setCorpusSettled(true);
        setLoadError(error instanceof Error ? error : new Error("The editor library could not be loaded."));
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [active, readerIdentity, reloadGeneration]);

  useEffect(() => () => {
    const obsolete = waiters.current.filter((waiter) => waiter.identity === readerIdentity);
    waiters.current = waiters.current.filter((waiter) => waiter.identity !== readerIdentity);
    for (const waiter of obsolete) waiter.reject(new Error("The editor session changed."));
  }, [readerIdentity]);

  const isComplete = active && corpusSettled;

  // Layouts and the corpus share the same intent and authenticated cache.
  const mayLoadIndexLayouts = active && readerIdentity !== null;
  const {
    configs: indexConfigs,
    isLoading: isLoadingConfigs,
    error: layoutsError,
    retry: retryLayouts,
  } = useIndexLayouts(mayLoadIndexLayouts);

  const library = useMemo<LibraryData<SubstanceArticle> | null>(() => {
    if (!active) {
      return null;
    }

    // A resolved empty corpus is valid; a failed read is not a baseline.
    if (!isComplete || dataArticles === null || dataIdentity !== readerIdentity || loadError) {
      return null;
    }

    if (!indexConfigs) {
      return null;
    }

    // Build library with configs from Postgres
    return buildLibrary(dataArticles, indexConfigs);
  }, [active, isComplete, dataArticles, dataIdentity, readerIdentity, indexConfigs, loadError]);

  const error = loadError?.message ?? layoutsError;
  useEffect(() => {
    if (!isComplete || isLoadingConfigs) return;
    if (!library && !error) return;
    const pending = waiters.current.splice(0);
    if (library) {
      for (const waiter of pending) waiter.resolve();
    } else {
      const failure = new Error(error ?? "The editor library could not be loaded.");
      for (const waiter of pending) waiter.reject(failure);
    }
  }, [error, library, loadError, isComplete, isLoadingConfigs]);

  const requestLibrary = useCallback(() => {
    if (!readerIdentity) return Promise.reject(new Error("Sign in before loading the editor library."));
    if (library) return Promise.resolve();
    if (error) {
      // Clear the settled failure before registering the retry waiter so the
      // previous attempt cannot reject a promise for the new attempt.
      setLoadError(null);
      setCorpusSettled(false);
      setReloadGeneration((generation) => generation + 1);
      retryLayouts();
    }
    setRequested(true);
    return new Promise<void>((resolve, reject) => {
      waiters.current.push({ identity: readerIdentity, resolve, reject });
    });
  }, [error, library, readerIdentity, retryLayouts]);

  return {
    library,
    requestLibrary,
    error,
    isLoading: active && (!isComplete || (!loadError && dataIdentity !== readerIdentity) || !mayLoadIndexLayouts || isLoadingConfigs),
    isReady: library !== null,
    isEmpty: isComplete && !loadError && dataIdentity === readerIdentity && dataArticles !== null && dataArticles.length === 0,
  };
}
