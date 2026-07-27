import { useEffect, useState } from "react";
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

/** Test seam: forget any loaded manifest and reset the attempt counter. */
export function resetSearchManifestForTests() {
  manifestIndexPromise = null;
  loadedManifestIndex = null;
  loadAttempts = 0;
}

/**
 * The manifest index once it is available, or `null` while it loads or if it
 * failed. `enabled` defers the request until the user actually engages search.
 */
export function useSearchManifestIndex(enabled: boolean): SearchManifestIndex | null {
  const [index, setIndex] = useState<SearchManifestIndex | null>(() => loadedManifestIndex);

  useEffect(() => {
    if (!enabled || index) {
      return;
    }

    let disposed = false;
    void loadSearchManifestIndex().then((loaded) => {
      if (!disposed && loaded) {
        setIndex(loaded);
      }
    });

    return () => {
      disposed = true;
    };
  }, [enabled, index]);

  return index;
}
