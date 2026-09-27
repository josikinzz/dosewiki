"use client";

import type { RefObject } from "react";

import { cn } from "@/lib/utils";
import { TAG_FIELD_LABELS } from "@/utils/data/tagRegistry";

import { DevWorkingChangesPanel } from "../pages/DevWorkingChangesPanel";
import type { DevCommitControls } from "../pages/useDevModeSaveActions";
import { CappedList } from "../tools/home/homeParts";
import { TagFeedback } from "./TagFeedback";
import { articleWord, describeTagChange, type TagChange } from "./tagEditorModel";
import type { TagNoticeState } from "./types";

type WorkingChangesPanelProps = {
  commit: DevCommitControls;
  tagChanges: TagChange[];
  datasetMarkdown: string;
  hasDatasetChanges: boolean;
  onCopyDiff: () => void;
  onDownloadDiff: () => void;
  /** The copy or download result. */
  diffNotice: TagNoticeState | null;
  isApplying: boolean;
  saveKeyLabel: string;
  /** Commits (or submits) with the tag changes named in the confirm. */
  onCommit: () => void;
  headingRef?: RefObject<HTMLHeadingElement | null>;
};

/** The tag changes in words, for the commit confirm: what readers will see change. */
export function TagChangeLead({ changes }: { changes: TagChange[] }) {
  if (changes.length === 0) return null;
  return (
    <section aria-label="Tag changes" className="space-y-1.5">
      <h3 className="type-meta-label theme-text-muted">{`Tags changed, ${changes.length}`}</h3>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
        {changes.map((change) => (
          <li key={`${change.field}:${change.key}`} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="min-w-0">
              <span className={cn("break-words", change.kind === "gone" ? "theme-text-muted line-through decoration-1" : "theme-text-primary")}>{change.tag}</span>
              <span className="theme-text-faint text-xs">{` ${TAG_FIELD_LABELS[change.field]}`}</span>
            </span>
            <span className="theme-text-muted text-xs">
              <span className="sr-only">, </span>
              {describeTagChange(change)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Everything Tags has changed and not yet committed, in one place: how much
 * waits, which tags moved (new, gone, on more or fewer articles), the one
 * commit button with its server check, the result of the last commit, and
 * the full diff with copy and download folded underneath. The shared
 * `DevWorkingChangesPanel` draws the frame; this supplies the tag words.
 */
export function WorkingChangesPanel(
  { commit, tagChanges, datasetMarkdown, hasDatasetChanges, onCopyDiff, onDownloadDiff, diffNotice, isApplying, saveKeyLabel, onCommit, headingRef }: WorkingChangesPanelProps,
) {
  const articlesScope = commit.scope.find((dataset) => dataset.id === "articles");
  const otherScope = commit.scope.filter((dataset) => dataset.id !== "articles");

  return (
    <DevWorkingChangesPanel
      commit={commit}
      id="tag-working-changes"
      headingRef={headingRef}
      idleSummary="Nothing waiting to commit. Renames, merges, moves and removals collect here."
      pendingSummary={articlesScope
        ? `${articleWord(articlesScope.count)} changed, not live yet.`
        : "Changes from another tool wait here, not live yet."}
      summaryNote={otherScope.length > 0
        ? `Also in this commit: ${otherScope.map((dataset) => `${dataset.label} (${dataset.countLabel})`).join(", ")}.`
        : undefined}
      saveKeyLabel={saveKeyLabel}
      onCommit={onCommit}
      diff={{
        markdown: datasetMarkdown,
        hasChanges: hasDatasetChanges,
        onCopy: onCopyDiff,
        onDownload: onDownloadDiff,
        disabled: isApplying,
        feedback: diffNotice ? <TagFeedback notice={diffNotice} /> : undefined,
      }}
      changes={tagChanges.length > 0 ? (
        <div className="space-y-2">
          <h3 className="type-meta-label theme-text-muted">{`Tags changed, ${tagChanges.length}`}</h3>
          <CappedList
            items={tagChanges}
            getKey={(change) => `${change.field}:${change.key}`}
            label="Tags changed"
            noun="changed tags"
            renderItem={(change) => (
              <div className="flex min-h-10 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-2.5 py-2 text-sm">
                <span className="min-w-0">
                  <span className={cn("break-words", change.after === 0 ? "theme-text-muted line-through decoration-1" : "theme-text-primary")}>{change.tag}</span>
                  <span className="theme-text-faint text-xs">
                    <span className="sr-only">, </span>
                    {` ${TAG_FIELD_LABELS[change.field]}`}
                  </span>
                </span>
                <span className="theme-text-muted text-xs tabular-nums">
                  <span className="sr-only">, </span>
                  {describeTagChange(change)}
                </span>
              </div>
            )}
          />
        </div>
      ) : null}
    />
  );
}
