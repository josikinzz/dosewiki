import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  buildSearchManifestIndex,
  type SearchManifest,
  type SearchManifestIndex,
} from "../data/builders/searchManifest";
import type { UiLocale } from "../i18n/messages";

const MAX_LOAD_ATTEMPTS = 2;

/**
 * One manifest per locale per document, shared by every search surface.
 *
 * Fetches and fold-once builds are module-level rather than per-hook so a
 * header search box and a results page mounted together do not each pay for
 * them. HTTP caching handles repeat visits, so nothing is mirrored into
 * `sessionStorage` where it could go stale against the served locale ETag.
 */
const manifestIndexPromises = new Map<UiLocale, Promise<SearchManifestIndex | null>>();
/**
 * Resolved indexes are locale-qualified so navigation cannot briefly display
 * labels from the previous language while the requested manifest loads.
 */
const loadedManifestIndexes = new Map<UiLocale, SearchManifestIndex>();
const loadAttemptsByLocale = new Map<UiLocale, number>();
const manifestListeners = new Set<() => void>();

function emitManifestChange() {
  for (const listener of manifestListeners) listener();
}

async function fetchSearchManifestIndex(locale: UiLocale): Promise<SearchManifestIndex | null> {
  const response = await fetch(`/api/search-manifest?locale=${encodeURIComponent(locale)}`);
  if (!response.ok) {
    throw new Error(`Search manifest request failed: ${response.status}`);
  }

  const manifest = (await response.json()) as SearchManifest;
  if (manifest.locale !== locale) {
    throw new Error(`Search manifest locale mismatch: requested ${locale}, received ${manifest.locale}`);
  }
  return buildSearchManifestIndex(manifest);
}

export function loadSearchManifestIndex(
  locale: UiLocale = "en",
): Promise<SearchManifestIndex | null> {
  const existing = manifestIndexPromises.get(locale);
  if (existing) {
    return existing;
  }

  const attempts = loadAttemptsByLocale.get(locale) ?? 0;
  if (attempts >= MAX_LOAD_ATTEMPTS) {
    return Promise.resolve(null);
  }

  loadAttemptsByLocale.set(locale, attempts + 1);
  const promise = fetchSearchManifestIndex(locale)
    .then((index) => {
      if (index) loadedManifestIndexes.set(locale, index);
      emitManifestChange();
      return index;
    })
    .catch(() => {
      manifestIndexPromises.delete(locale);
      return null;
    });
  manifestIndexPromises.set(locale, promise);
  return promise;
}

/**
 * Warm the manifest during browser idle time, well before the user engages
 * search. The download (~85 KB gzipped) never competes with hydration or
 * user-visible work, and repeat visits revalidate against the route's ETag in
 * a 304. Safe to call from every search surface: the module-level promise
 * makes it a no-op after the first call.
 */
export function preloadSearchManifestIndex(locale: UiLocale = "en") {
  if (
    typeof window === "undefined" ||
    manifestIndexPromises.has(locale) ||
    loadedManifestIndexes.has(locale)
  ) {
    return;
  }

  const schedule =
    typeof window.requestIdleCallback === "function"
      ? (callback: () => void) => window.requestIdleCallback(callback)
      : (callback: () => void) => window.setTimeout(callback, 200);

  schedule(() => {
    void loadSearchManifestIndex(locale);
  });
}

/** Test seam: forget any loaded manifest and reset the attempt counter. */
export function resetSearchManifestForTests() {
  manifestIndexPromises.clear();
  loadedManifestIndexes.clear();
  loadAttemptsByLocale.clear();
  emitManifestChange();
}

/**
 * The manifest index once it is available, or `null` while it loads or if it
 * failed. `enabled` defers the request until the user actually engages search.
 */
export function useSearchManifestIndex(
  enabled: boolean,
  locale: UiLocale = "en",
): SearchManifestIndex | null {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!enabled) return () => {};
      manifestListeners.add(onStoreChange);
      return () => manifestListeners.delete(onStoreChange);
    },
    [enabled],
  );
  const getSnapshot = useCallback(
    () => (enabled ? (loadedManifestIndexes.get(locale) ?? null) : null),
    [enabled, locale],
  );
  const index = useSyncExternalStore(subscribe, getSnapshot, () => null);

  useEffect(() => {
    if (!enabled || index) {
      return;
    }

    void loadSearchManifestIndex(locale);
  }, [enabled, index, locale]);

  return index;
}
