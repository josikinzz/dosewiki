"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchCandidatesBySlug, type PlaylistCandidate } from "./playlistCandidates";

export type WorkCards = {
  get: (slug: string) => PlaylistCandidate | null | undefined;
  remember: (candidates: readonly PlaylistCandidate[]) => void;
  resolve: (slug: string) => Promise<PlaylistCandidate | null>;
  unavailable: ReadonlySet<string>;
  error: string | null;
  retry: () => void;
};

export function useWorkCards(slugs: readonly string[], enabled: boolean): WorkCards {
  const [known, setKnown] = useState<ReadonlyMap<string, PlaylistCandidate | null>>(() => new Map());
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

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
  }, [missingKey, record, attempt]);

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

  const retry = useCallback(() => {
    setError(null);
    setAttempt((count) => count + 1);
  }, []);

  return { get: (slug) => known.get(slug), remember, resolve, unavailable, error, retry };
}
