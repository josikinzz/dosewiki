"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { ChangelogDiff } from "./ChangelogDiff";
import { ProseDiff, type CitationContext } from "./ProseDiff";

export function HistoryDiff({ entryId, subjectSlug, id, prose = false, wholeEntry = false, citations, className }: {
  entryId: string;
  subjectSlug?: string | null;
  id: string;
  prose?: boolean;
  wholeEntry?: boolean;
  citations?: CitationContext;
  className?: string;
}) {
  const t = useT();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ markdown: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setFailed(false);
    const params = new URLSearchParams();
    if (subjectSlug) params.set("article", subjectSlug);
    if (wholeEntry) params.set("view", "entry");
    void fetch(`/api/history/${encodeURIComponent(entryId)}?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("History unavailable");
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || !("markdown" in data) || typeof data.markdown !== "string") throw new Error("Invalid history response");
        if (!controller.signal.aborted) setResult({ markdown: data.markdown });
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [entryId, subjectSlug, wholeEntry, attempt]);

  return <div id={id} className={className} lang="en" data-source-language="en">
    {failed ? <div role="alert"><p>{t("Unable to load changes.")}</p><Button variant="quiet" onClick={() => setAttempt((value) => value + 1)}>{t("Retry")}</Button></div>
      : !result ? <p role="status">{t("Loading changes…")}</p>
      : !result.markdown.trim() ? <p role="status">{t("No diff is available for this change.")}</p>
      : prose ? <ProseDiff id={`${id}-content`} markdown={result.markdown} citations={citations} />
      : <ChangelogDiff id={`${id}-content`} markdown={result.markdown} keyPrefix={entryId} />}
  </div>;
}
