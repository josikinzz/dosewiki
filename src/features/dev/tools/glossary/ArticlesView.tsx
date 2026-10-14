"use client";
/**
 * The Articles view: the article reader first, then the release facts that
 * used to be drawers under it, each its own section of the view: Coverage,
 * Recent changes, Reactions, and for admins Runs. A section mounts the
 * first time it opens and stays mounted, so a loaded report or a half-typed
 * correction survives a switch. Write results from Runs land in Runs.
 */
import { useState } from "react";

import { EditorSegmentedControl, EditorStatusPill, type NoticeMessage } from "@/features/dev/components";

import { GlossaryReaderFeedback } from "./GlossaryReaderFeedback";
import type { GlossaryList } from "./glossaryModel";
import { NarrativeReview } from "./NarrativeReview";
import { RunsPanel } from "./RunsPanel";
import { TranslationChanges } from "./TranslationChanges";
import { TranslationCoverage } from "./TranslationCoverage";
import { ResultNotice } from "./workbenchParts";

export type ArticlesSection = "reader" | "coverage" | "changes" | "feedback" | "runs";

export type RunsProps = {
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
  /** The latest run in a few words, or null when there has been none. */
  status: string | null;
  /** What a running run write is doing, or null. */
  activity: string | null;
  notice: NoticeMessage | null;
  onDismissNotice: () => void;
};

export function ArticlesView({ locale, canAdmin, articleLink, initialSection, sectionRequest = null, onSectionChange, runs }: {
  locale: string;
  canAdmin: boolean;
  /** Bumped when an Inbox link opens an article, so the reader remounts and reads the link. */
  articleLink: number;
  /** The section a deep link asked for (`coverage`, `changes`). */
  initialSection: ArticlesSection | null;
  /** Another view asking for a section (Terms' "Open Runs"); `n` changes on each ask. */
  sectionRequest?: { section: ArticlesSection; n: number } | null;
  onSectionChange: (section: ArticlesSection) => void;
  runs: RunsProps;
}) {
  const first = sectionRequest?.section ?? initialSection ?? "reader";
  const [section, setSection] = useState<ArticlesSection>(first);
  const [visited, setVisited] = useState<Set<ArticlesSection>>(() => new Set([first]));
  const [prevLink, setPrevLink] = useState(articleLink);
  const [prevRequest, setPrevRequest] = useState(sectionRequest?.n ?? 0);
  if (sectionRequest && sectionRequest.n !== prevRequest) {
    setPrevRequest(sectionRequest.n);
    setSection(sectionRequest.section);
    setVisited((current) => new Set(current).add(sectionRequest.section));
  }
  // An Inbox link to an article always lands on the reader.
  if (articleLink !== prevLink) {
    setPrevLink(articleLink);
    setSection("reader");
  }
  const open = (next: ArticlesSection) => {
    setSection(next);
    setVisited((current) => new Set(current).add(next));
    onSectionChange(next);
  };
  const options = [
    { value: "reader", label: "Reader" },
    { value: "coverage", label: "Coverage" },
    { value: "changes", label: "Recent changes" },
    { value: "feedback", label: "Reactions" },
    ...(canAdmin ? [{ value: "runs", label: runs.data.jobs.active > 0 ? "Runs, running" : "Runs" }] : []),
  ];
  return (
    <div className="space-y-5">
      <EditorSegmentedControl label="Articles view" value={section} options={options} onChange={(value) => open(value as ArticlesSection)} />

      <div hidden={section !== "reader"}>
        <NarrativeReview key={`${locale}:${articleLink}`} locale={locale} canAdmin={canAdmin} />
      </div>
      {visited.has("coverage") ? (
        <div hidden={section !== "coverage"}>
          <TranslationCoverage locale={locale} />
        </div>
      ) : null}
      {visited.has("changes") ? (
        <div hidden={section !== "changes"}>
          <TranslationChanges locale={locale} />
        </div>
      ) : null}
      {visited.has("feedback") ? (
        <div hidden={section !== "feedback"}>
          <GlossaryReaderFeedback locale={locale} />
        </div>
      ) : null}
      {canAdmin && visited.has("runs") ? (
        <section hidden={section !== "runs"} aria-labelledby="glossary-runs-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="glossary-runs-heading" className="theme-text-primary text-base font-semibold">Runs</h3>
            <p className="theme-text-muted text-sm">{runs.status ?? "No run recorded"}</p>
          </div>
          <RunsPanel
            data={runs.data}
            pending={runs.pending}
            reviewComplete={runs.reviewComplete}
            draftCount={runs.draftCount}
            locked={runs.locked}
            starting={runs.starting}
            refreshError={runs.refreshError}
            onRefresh={runs.onRefresh}
            onStart={runs.onStart}
            onRetranslate={runs.onRetranslate}
            onRetryExhausted={runs.onRetryExhausted}
            result={
              <>
                {runs.activity ? <EditorStatusPill tone="info" loading live>{runs.activity}</EditorStatusPill> : null}
                <ResultNotice notice={runs.notice} onDismiss={runs.onDismissNotice} />
              </>
            }
          />
        </section>
      ) : null}
    </div>
  );
}
