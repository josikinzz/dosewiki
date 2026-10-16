import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { buildLibrary } from "../data/builders/libraryBuilder";
import { createEmptyArticle } from "../data/schema/defaults.generated";
import type { LibraryData } from "../data/SubstanceIndexProvider";
import type { SubstanceArticle } from "../schema";
import { useIndexLayouts } from "./useIndexLayouts";

const EDITOR_LIBRARY_ENDPOINT = "/api/dev/editor-library";

type EditorLibraryEntry = Partial<SubstanceArticle> & { slug?: string };

type EditorLibraryPayload = { articles?: EditorLibraryEntry[] };

function expandEditorLibraryEntry(entry: EditorLibraryEntry): SubstanceArticle {
  return { ...createEmptyArticle(), ...entry } as SubstanceArticle;
}

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
      .then(async (response): Promise<EditorLibraryEntry[]> => {
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
        return payload.articles;
      })
      .then((articles) => {
        if (cancelled) return;
        setDataArticles(articles.map(expandEditorLibraryEntry));
        setDataIdentity(readerIdentity);
        setCorpusSettled(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
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

    if (!isComplete || dataArticles === null || dataIdentity !== readerIdentity || loadError) {
      return null;
    }

    if (!indexConfigs) {
      return null;
    }

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
