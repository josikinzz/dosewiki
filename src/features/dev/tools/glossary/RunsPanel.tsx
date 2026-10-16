"use client";

import type { ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";

import { count, type GlossaryList } from "./glossaryModel";
import { PendingTermsList } from "./PendingTermsList";
import { TranslationProgress } from "./TranslationProgress";

export function RunsPanel({ data, pending, reviewComplete, draftCount, locked, starting, refreshError, onRefresh, onStart, onRetranslate, onRetryExhausted, result }: {
  data: GlossaryList;
  pending: readonly string[];
  reviewComplete: boolean;
  draftCount: number;
  locked: boolean;
  starting: boolean;
  refreshError: string | null;
  onRefresh: () => void;
  onStart: () => void;
  onRetranslate: () => void;
  onRetryExhausted: () => void;
  result?: ReactNode;
}) {
  const nothingTranslatedYet = data.segments.total === 0;
  const running = data.jobs.active > 0;
  return (
    <section aria-label="Translation runs" className="space-y-4">
      <TranslationProgress data={data} starting={starting} error={refreshError} onRefresh={onRefresh} onRetryExhausted={onRetryExhausted} retryDisabled={locked} />
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Run actions">
        {reviewComplete ? (
          <Button type="button" variant={nothingTranslatedYet ? "accent" : "outline"} size="sm" disabled={locked || running} onClick={onStart}>
            <Icon icon="lucide:play" size={14} />
            {running ? "Translation running" : nothingTranslatedYet ? "Start main translation" : "Run the main translation again"}
          </Button>
        ) : null}
        {nothingTranslatedYet ? null : (
          <Button
            type="button"
            variant={pending.length > 0 ? "accent" : "outline"}
            size="sm"
            disabled={locked || pending.length === 0 || running}
            aria-label={`Retranslate everything that mentions ${count(pending.length, "term")}`}
            onClick={onRetranslate}
          >
            <Icon icon="lucide:languages" size={14} />
            Retranslate
          </Button>
        )}
      </div>
      {result ? <div aria-live="polite" className="space-y-2 empty:hidden">{result}</div> : null}
      {!reviewComplete && data.rows.length > 0 ? (
        <p className="theme-text-faint text-xs">
          The main translation can start once every term is reviewed: {count(draftCount, "term")} still {draftCount === 1 ? "needs" : "need"} a decision in Terms.
        </p>
      ) : null}
      {nothingTranslatedYet ? (
        <p className="theme-text-faint text-xs">Starting the main translation uses the shared worker pool, capped at 100 simultaneous requests to the translation model.</p>
      ) : null}
      {!nothingTranslatedYet ? <PendingTermsList terms={pending} /> : null}
    </section>
  );
}
