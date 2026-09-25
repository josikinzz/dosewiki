"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchCandidatesBySlug, type PlaylistCandidate } from "./playlistCandidates";

export type WorkCards = {
  /** The card for a slug; `null` when the lookup found no such work, `undefined` while unknown. */
  get: (slug: string) => PlaylistCandidate | null | undefined;
  /** Keeps cards a search already returned, so adding one needs no second read. */
  remember: (candidates: readonly PlaylistCandidate[]) => void;
  /** Looks one slug up now; resolves to `null` when no work a playlist can hold has it. */
  resolve: (slug: string) => Promise<PlaylistCandidate | null>;
  /** Slugs the lookup could not find. */
  unavailable: ReadonlySet<string>;
  /** The last lookup failure, if any; entries then stay unknown rather than missing. */
  error: string | null;
};

/**
 * Thumbnail cards for a playlist's entries, read through the bounded
 * candidates route. Every slug on the list is looked up once; a slug the read
 * does not return is recorded as missing, which is how the editor can say
 * which entries a save would leave out before anyone presses Save.
 */
export function useWorkCards(slugs: readonly string[], enabled: boolean): WorkCards {
  const [known, setKnown] = useState<ReadonlyMap<string, PlaylistCandidate | null>>(() => new Map());
  const [error, setError] = useState<string | null>(null);

  const record = useCallback((asked: readonly string[], found: readonly PlaylistCandidate[]) => {
    setKnown((current) => {
      const next = new Map(current);
      const bySlug = new Map(found.map((card) => [card.slug, card]));
      for (const slug of asked) next.set(slug, bySlug.get(slug) ?? null);
      return next;
    });
  }, []);

  const missingKey = enabled ? slugs.filter((slug) => !known.has(slug)).join(",") : "";

  useEffect(() => {
    if (!missingKey) return;
    const asked = missingKey.split(",");
    let cancelled = false;
    fetchCandidatesBySlug(asked)
      .then((found) => {
        if (cancelled) return;
        setError(null);
        record(asked, found);
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setError(failure instanceof Error ? failure.message : "Unable to look up works right now.");
      });
    return () => {
      cancelled = true;
    };
  }, [missingKey, record]);

  const remember = useCallback((candidates: readonly PlaylistCandidate[]) => {
    if (candidates.length === 0) return;
    setKnown((current) => {
      const next = new Map(current);
      for (const card of candidates) next.set(card.slug, card);
      return next;
    });
  }, []);

  const resolve = useCallback(
    async (slug: string) => {
      const cached = known.get(slug);
      if (cached !== undefined) return cached;
      const found = await fetchCandidatesBySlug([slug]);
      record([slug], found);
      return found.find((card) => card.slug === slug) ?? null;
    },
    [known, record],
  );

  const unavailable = useMemo(
    () => new Set([...known].filter(([, card]) => card === null).map(([slug]) => slug)),
    [known],
  );

  return { get: (slug) => known.get(slug), remember, resolve, unavailable, error };
}
