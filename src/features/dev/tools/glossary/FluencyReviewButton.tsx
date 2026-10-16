"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { FluencyRunSummary } from "@lib/translation/fluencyReview";
import { translationRequest } from "./TranslationHistory";

function droppedText(run: FluencyRunSummary): string {
  const drops = Object.entries(run.dropped).filter(([, count]) => count > 0);
  const total = drops.reduce((sum, [, count]) => sum + count, 0);
  return total ? `, ${total} dropped (${drops.map(([reason, count]) => `${count} ${reason}`).join(", ")})` : "";
}

export function FluencyReviewButton({ locale, slug }: { locale: string; slug: string }) {
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<FluencyRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    setRun(null);
    try {
      setRun((await translationRequest<{ run: FluencyRunSummary }>("/api/dev/translation-fluency", { locale, slug })).run);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The fluency review failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-1">
    <Button size="sm" variant="outline" disabled={busy} onClick={() => void start()}>{busy ? "Reviewing fluency" : "Review fluency"}</Button>
    {error ? <p role="alert" className="theme-text-secondary text-sm">{error}</p> : null}
    {run ? <p role="status" className="theme-text-secondary text-sm">
      {run.stored} {run.stored === 1 ? "suggestion" : "suggestions"} sent to Waiting{droppedText(run)}. Reviewed {run.reviewed} paragraphs{run.skipped ? `; ${run.skipped} over the request cap were not reviewed` : ""}.
      {" "}{run.model} · prompt {run.promptVersion} · {run.usage.prompt + run.usage.completion} tokens in {run.usage.requests} {run.usage.requests === 1 ? "request" : "requests"}.
    </p> : null}
  </div>;
}
