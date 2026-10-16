"use client";

import { useEffect, useState } from "react";

import type { PublishedRevisions } from "./reviewQueue";

export function usePublishedRevisions(): PublishedRevisions | null {
  const [revisions, setRevisions] = useState<PublishedRevisions | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dev/review-revisions")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { revisions?: unknown } | null) => {
        if (cancelled) return;
        const value = payload?.revisions;
        if (!value || typeof value !== "object" || Array.isArray(value)) return;
        setRevisions(
          Object.fromEntries(
            Object.entries(value as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
          ),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return revisions;
}
