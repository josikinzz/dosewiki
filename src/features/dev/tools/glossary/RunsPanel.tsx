"use client";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";

import { count, type GlossaryList } from "./glossaryModel";
import { PendingTermsList } from "./PendingTermsList";
import { TranslationProgress } from "./TranslationProgress";

/**
 * Admin run controls, in one place: the latest run's progress, the main
 * translation, the retranslation of pending terms, and the retry of failed
 * pages. Every button calls the model, so the workbench renders this only for
 * admins. The actions themselves live in the workbench and are unchanged.
 */
export function RunsPanel({ data, pending, reviewComplete, draftCount, locked, starting, refreshError, onRefresh, onStart, onRetranslate, onRetryExhausted }: {
  data: GlossaryList;
  /** Approved terms the stored translations have not been redone for. */
  pending: readonly string[];
  /** Every glossary row has a decision, so the main translation may start. */
  reviewComplete: boolean;
  draftCount: number;
  locked: boolean;
  starting: boolean;
  refreshError: string | null;
  onRefresh: () => void;
  onStart: () => void;
  onRetranslate: () => void;
  onRetryExhausted: () => void;
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
        {/* Absent, not disabled, until something has been translated: there is nothing to redo. */}
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
      {!reviewComplete && data.rows.length > 0 ? (
        <p className="theme-text-faint text-xs">
          The main translation can start once every term is reviewed: {count(draftCount, "term")} still {draftCount === 1 ? "needs" : "need"} a decision.
        </p>
      ) : null}
      {nothingTranslatedYet ? (
        <p className="theme-text-faint text-xs">Starting the main translation uses the shared worker pool, capped at 100 simultaneous requests to the translation model.</p>
      ) : null}
      {!nothingTranslatedYet ? <PendingTermsList terms={pending} /> : null}
    </section>
  );
}
