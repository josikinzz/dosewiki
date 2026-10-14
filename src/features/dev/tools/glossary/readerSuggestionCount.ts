"use client";

import { useEffect, useState } from "react";

import { glossaryFeedbackAdapter } from "../feedback/glossaryFeedbackAdapter";

/**
 * How many suggestions in one language still wait for a translator, new or
 * being reviewed; null until known or when the count cannot be read. Read
 * again whenever `refresh` changes, so a decision shows on the tab.
 */
export function useReaderSuggestionCount(locale: string | null, refresh: unknown): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!locale) return;
    let live = true;
    glossaryFeedbackAdapter(locale)
      .fetchPage({ status: "unresolved", search: "", sort: "newest", cursor: null })
      .then(({ counts }) => { if (live) setCount(counts.new + counts.reviewing); })
      .catch(() => { if (live) setCount(null); });
    return () => { live = false; };
  }, [locale, refresh]);
  return locale ? count : null;
}
