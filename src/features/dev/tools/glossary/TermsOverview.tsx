"use client";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { count, STATE_WORD, type ReviewCounts } from "./glossaryModel";

export type NextCategory = { id: string; label: string; left: number };

type TermsOverviewProps = {
  counts: ReviewCounts;
  next: NextCategory | null;
  canAdmin: boolean;
  pendingCount: number;
  nothingTranslatedYet: boolean;
  locked: boolean;
  onContinue: (categoryId: string) => void;
  onOpenRuns?: () => void;
};

export function TermsOverview({ counts, next, canAdmin, pendingCount, nothingTranslatedYet, locked, onContinue, onOpenRuns }: TermsOverviewProps) {
  const total = counts.drafts + counts.unchecked + counts.approved;
  if (total === 0) return null;
  const share = (n: number) => `${(n / total) * 100}%`;
  const left = counts.drafts + counts.unchecked;
  const runsLink = canAdmin && onOpenRuns ? (
    <Button type="button" variant="link" size="auto" className="text-xs" onClick={onOpenRuns}>Open Runs</Button>
  ) : null;
  const aftermath = left > 0 ? null : nothingTranslatedYet
    ? <>Nothing has been translated with these terms yet.{canAdmin ? <> Start the main translation from Runs in Articles. {runsLink}</> : " An admin starts the main translation."}</>
    : pendingCount > 0
      ? canAdmin
        ? <>{count(pendingCount, "approved translation")} {pendingCount === 1 ? "has" : "have"} not reached the article translations yet. Retranslate from Runs in Articles. {runsLink}</>
        : "Approved changes reach the article translations when an admin retranslates."
      : null;

  return (
    <Surface variant="subtle" padding="md" radius="lg" className="space-y-3" data-testid="glossary-summary">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-0.5">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            {left === 0 ? <Icon icon="lucide:check-check" size={18} className="text-[color:var(--theme-success-text)]" /> : null}
            {left === 0 ? "Every term is reviewed" : `${counts.approved} of ${count(total, "term")} approved`}
          </h3>
          <p className="theme-text-secondary flex flex-wrap items-center gap-x-3 text-sm tabular-nums">
            {left === 0
              ? `${count(total, "term")} approved`
              : [
                  counts.drafts > 0 ? `${counts.drafts} ${STATE_WORD.draft}` : null,
                  counts.unchecked > 0 ? `${counts.unchecked} live, never checked` : null,
                ].filter(Boolean).join(" · ")}
          </p>
        </div>
        {next ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="theme-text-muted order-last text-xs sm:order-first">Next: {next.label}, {next.left} left</span>
            <Button type="button" variant="accent" size="sm" disabled={locked} onClick={() => onContinue(next.id)}>
              Continue reviewing
              <Icon icon="lucide:arrow-right" size={14} />
            </Button>
          </div>
        ) : null}
      </div>
      <div
        role="progressbar"
        aria-label="Glossary review"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={counts.approved}
        aria-valuetext={`${counts.approved} of ${count(total, "term")} approved; ${counts.unchecked} live, never checked`}
        className="flex h-2 overflow-hidden rounded-full theme-progress-track"
      >
        <span className="block h-full bg-[var(--theme-accent)]" style={{ width: share(counts.approved) }} />
        <span className="block h-full bg-[var(--theme-semantic-info-badge-text)] opacity-60" style={{ width: share(counts.unchecked) }} />
      </div>
      <div aria-hidden className="theme-text-muted flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--theme-accent)]" />Approved</span>
        {counts.unchecked > 0 ? <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--theme-semantic-info-badge-text)] opacity-60" />Live, never checked</span> : null}
        {counts.drafts > 0 ? <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full theme-progress-track" />Unreviewed</span> : null}
      </div>
      {left > 0 && canAdmin ? (
        <p className="theme-text-muted text-xs">The main translation can start once every term is reviewed.</p>
      ) : null}
      {aftermath ? <p className="theme-text-muted text-xs">{aftermath}</p> : null}
    </Surface>
  );
}
