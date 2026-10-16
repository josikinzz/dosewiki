import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  buildSearchManifestIndex,
  type SearchManifest,
  type SearchManifestIndex,
} from "../data/builders/searchManifest";
import type { UiLocale } from "../i18n/messages";

const manifestIndexPromises = new Map<UiLocale, Promise<SearchManifestIndex | null>>();
const loadedManifestIndexes = new Map<UiLocale, SearchManifestIndex>();
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

  const promise = fetchSearchManifestIndex(locale)
    .then((index) => {
      if (index) loadedManifestIndexes.set(locale, index);
      emitManifestChange();
      return index;
    })
    .catch(() => {
      manifestIndexPromises.delete(locale);
      emitManifestChange();
      return null;
    });
  manifestIndexPromises.set(locale, promise);
  return promise;
}

export function useSearchManifestIndex(
  enabled: boolean,
  locale: UiLocale = "en",
  requestIfMissing = true,
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
    if (!enabled || index || !requestIfMissing) {
      return;
    }

    void loadSearchManifestIndex(locale);
  }, [enabled, index, locale, requestIfMissing]);

  return index;
}
