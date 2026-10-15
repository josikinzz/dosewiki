"use client";

import { useEffect, useState } from "react";

import { glossaryFeedbackAdapter } from "../feedback/glossaryFeedbackAdapter";

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
