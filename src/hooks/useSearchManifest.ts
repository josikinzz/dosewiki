import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  buildSearchManifestIndex,
  type SearchManifest,
  type SearchManifestIndex,
} from "../data/builders/searchManifest";

const MAX_LOAD_ATTEMPTS = 2;

/**
 * One manifest per document, shared by every search surface.
 *
 * The fetch and the fold-once build are module-level rather than per-hook so a
 * header search box and a results page mounted together do not each pay for
 * them. HTTP caching handles repeat visits, so nothing is mirrored into
 * `sessionStorage` where it could go stale against the served ETag.
 */
let manifestIndexPromise: Promise<SearchManifestIndex | null> | null = null;
/**
 * The resolved index, kept separately so a component mounting after the load
 * has it on its first render — the header search box warms the manifest, and
 * the results page that opens next matches without a state round trip.
 */
let loadedManifestIndex: SearchManifestIndex | null = null;
let loadAttempts = 0;
const manifestListeners = new Set<() => void>();

function emitManifestChange() {
  for (const listener of manifestListeners) listener();
}

async function fetchSearchManifestIndex(): Promise<SearchManifestIndex | null> {
  const response = await fetch("/api/search-manifest");
  if (!response.ok) {
    throw new Error(`Search manifest request failed: ${response.status}`);
  }

  const manifest = (await response.json()) as SearchManifest;
  return buildSearchManifestIndex(manifest);
}

export function loadSearchManifestIndex(): Promise<SearchManifestIndex | null> {
  if (manifestIndexPromise) {
    return manifestIndexPromise;
  }

  if (loadAttempts >= MAX_LOAD_ATTEMPTS) {
    return Promise.resolve(null);
  }

  loadAttempts += 1;
  manifestIndexPromise = fetchSearchManifestIndex()
    .then((index) => {
      loadedManifestIndex = index;
      emitManifestChange();
      return index;
    })
    .catch(() => {
      // Local matching is an accelerator, never a requirement — the server
      // endpoint still answers every query. Drop the cached promise so a later
      // search can try again, up to the attempt cap.
      manifestIndexPromise = null;
      return null;
    });

  return manifestIndexPromise;
}

/**
 * Warm the manifest during browser idle time, well before the user engages
 * search. The download (~85 KB gzipped) never competes with hydration or
 * user-visible work, and repeat visits revalidate against the route's ETag in
 * a 304. Safe to call from every search surface: the module-level promise
 * makes it a no-op after the first call.
 */
export function preloadSearchManifestIndex() {
  if (typeof window === "undefined" || manifestIndexPromise || loadedManifestIndex) {
    return;
  }

  const schedule =
    typeof window.requestIdleCallback === "function"
      ? (callback: () => void) => window.requestIdleCallback(callback)
      : (callback: () => void) => window.setTimeout(callback, 200);

  schedule(() => {
    void loadSearchManifestIndex();
  });
}

/** Test seam: forget any loaded manifest and reset the attempt counter. */
export function resetSearchManifestForTests() {
  manifestIndexPromise = null;
  loadedManifestIndex = null;
  loadAttempts = 0;
  emitManifestChange();
}

/**
 * The manifest index once it is available, or `null` while it loads or if it
 * failed. `enabled` defers the request until the user actually engages search.
 */
export function useSearchManifestIndex(enabled: boolean): SearchManifestIndex | null {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!enabled) return () => {};
      manifestListeners.add(onStoreChange);
      return () => manifestListeners.delete(onStoreChange);
    },
    [enabled],
  );
  const getSnapshot = useCallback(
    () => (enabled ? loadedManifestIndex : null),
    [enabled],
  );
  const index = useSyncExternalStore(subscribe, getSnapshot, () => null);

  useEffect(() => {
    if (!enabled || index) {
      return;
    }

    void loadSearchManifestIndex();
  }, [enabled, index]);

  return index;
}
