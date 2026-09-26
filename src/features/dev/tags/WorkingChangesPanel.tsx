"use client";

import { useId, useState, type RefObject } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { TOUCH_HALO } from "@/components/ui/touchTargets";
import { DiffPreview } from "@/features/dev/components/DiffPreview";
import { EditorSection, Notice, useWriteFreeze } from "@/features/dev/components";
import { cn } from "@/lib/utils";
import { TAG_FIELD_LABELS } from "@/utils/data/tagRegistry";

import type { DevCommitControls } from "../pages/useDevModeSaveActions";
import { CappedList } from "../tools/home/homeParts";
import { TagFeedback } from "./TagFeedback";
import { articleWord, describeTagChange, type TagChange } from "./tagEditorModel";
import type { TagNoticeState } from "./types";

const PROPOSAL_ID_DISPLAY_LENGTH = 6;

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
 * the full diff with copy and download folded underneath. The frame's write
 * line already says how a batch goes live, so this never repeats it.
 */
export function WorkingChangesPanel(
  { commit, tagChanges, datasetMarkdown, hasDatasetChanges, onCopyDiff, onDownloadDiff, diffNotice, isApplying, saveKeyLabel, onCommit, headingRef }: WorkingChangesPanelProps,
) {
  const [diffOpen, setDiffOpen] = useState(false);
  // The save hook clears a success after a few seconds; the receipt (with its
  // Change Review link for a proposal) stays here until dismissed or replaced.
  const [receipt, setReceipt] = useState<DevCommitControls["notice"]>(null);
  const [seenNotice, setSeenNotice] = useState<DevCommitControls["notice"]>(null);
  if (commit.notice !== seenNotice) {
    setSeenNotice(commit.notice);
    if (commit.notice) setReceipt(commit.notice.type === "success" ? commit.notice : null);
  }
  const shownNotice = commit.notice ?? receipt;
  const diffId = useId();
  const { frozen } = useWriteFreeze();
  const production = commit.destination === "production";
  const articlesScope = commit.scope.find((dataset) => dataset.id === "articles");
  const otherScope = commit.scope.filter((dataset) => dataset.id !== "articles");
  const pending = commit.hasPendingChanges;
  const hasDiff = hasDatasetChanges && datasetMarkdown.trim().length > 0;
  const buttonLabel = production
    ? commit.isSaving ? "Committing" : "Commit to production"
    : commit.isSaving ? "Submitting" : "Submit for review";

  const summary = !pending
    ? "Nothing waiting to commit. Renames, merges, moves and removals collect here."
    : articlesScope
      ? `${articleWord(articlesScope.count)} changed, not live yet.`
      : "Changes from another tool wait here, not live yet.";

  return (
    <EditorSection
      id="tag-working-changes"
      icon="lucide:layers"
      title={<span ref={headingRef} tabIndex={-1} className="outline-none">Working changes</span>}
      className="scroll-mt-24"
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          {commit.health}
          <Button
            type="button"
            variant={commit.canCommit ? "accent" : "outline"}
            size="sm"
            onClick={onCommit}
            disabled={!commit.canCommit}
            aria-busy={commit.isSaving || undefined}
            aria-keyshortcuts="Meta+S Control+S"
            aria-describedby={commit.blockedReason && pending ? `${diffId}-blocked` : undefined}
          >
            <Icon icon={production ? "lucide:upload" : "lucide:send"} size={15} />
            {buttonLabel}
            {commit.canCommit ? (
              <span aria-hidden className="[@media(pointer:coarse)]:hidden">
                <kbd className="theme-dev-kbd !text-current opacity-70">{saveKeyLabel}</kbd>
              </span>
            ) : null}
          </Button>
        </div>
      )}
    >
      <div className="min-w-0 space-y-1">
          <p aria-live="polite" className={cn("flex items-center gap-2 text-sm", pending ? "theme-text-primary" : "theme-text-muted")}>
            {pending ? <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 shrink-0 rounded-full" /> : null}
            {summary}
          </p>
          {otherScope.length > 0 ? (
            <p className="theme-text-muted text-xs">
              {`Also in this commit: ${otherScope.map((dataset) => `${dataset.label} (${dataset.countLabel})`).join(", ")}.`}
            </p>
          ) : null}
      </div>

      {commit.blockedReason && pending ? (
        <p id={`${diffId}-blocked`} className="theme-warning-text flex items-start gap-2 text-xs">
          <Icon icon="lucide:triangle-alert" size={13} className="mt-0.5 shrink-0" />
          <span>{`${production ? "Commit" : "Submit"} waits: ${commit.blockedReason}`}</span>
        </p>
      ) : null}

      {commit.rebase ? (
        <Notice
          placement="inline"
          tone="info"
          icon="lucide:file-pen-line"
          message={(
            <span data-testid="commit-rebase-banner">
              Revising returned proposal #{commit.rebase.proposalId.slice(-PROPOSAL_ID_DISPLAY_LENGTH)}
              {commit.rebase.reason ? `: ${commit.rebase.reason}` : ""}
            </span>
          )}
          actions={(
            <Button type="button" variant="link" size="auto" className={cn("text-xs", TOUCH_HALO)} onClick={commit.rebase.onDiscard}>
              Discard
            </Button>
          )}
        />
      ) : null}

      {shownNotice ? (
        <Notice
          placement="inline"
          tone={shownNotice.type === "error" ? "danger" : shownNotice.type === "pending" ? "loading" : "success"}
          dismiss={shownNotice.type === "pending" ? undefined : () => {
            setReceipt(null);
            commit.dismissNotice();
          }}
          autoClearMs={null}
          actions={shownNotice.actionHref ? (
            <Button asChild variant="outline" size="xs">
              <a href={shownNotice.actionHref} target="_blank" rel="noreferrer">
                {shownNotice.actionLabel ?? "Open"}
              </a>
            </Button>
          ) : undefined}
        >
          {shownNotice.type === "error" && frozen
            ? `Writes are paused, so your changes were not ${production ? "committed" : "submitted"}. They stay in your working changes.`
            : shownNotice.message}
        </Notice>
      ) : null}

      {tagChanges.length > 0 ? (
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

      {hasDiff ? (
        <div className="space-y-3">
          <h3 className="m-0">
            <button
              type="button"
              aria-expanded={diffOpen}
              aria-controls={diffId}
              onClick={() => setDiffOpen((open) => !open)}
              className={cn("theme-focus-ring theme-text-muted hover:theme-text-primary inline-flex items-center gap-1.5 rounded-control text-sm", TOUCH_HALO)}
            >
              Show the full diff
              <ExpandIndicator isExpanded={diffOpen} />
            </button>
          </h3>
          <div id={diffId} hidden={!diffOpen} className="space-y-3">
            <p className="theme-text-muted max-w-[75ch] text-xs">
              Every change in your working changes so far, from every tool, as it will be committed.
            </p>
            <DiffPreview diffText={datasetMarkdown} maxHeight={320} />
            <div role="group" aria-label="Diff actions" className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="xs" onClick={onCopyDiff} disabled={!hasDatasetChanges || isApplying}>
                <Icon icon="lucide:copy" size={13} />
                Copy diff
              </Button>
              <Button type="button" variant="outline" size="xs" onClick={onDownloadDiff} disabled={!hasDatasetChanges || isApplying}>
                <Icon icon="lucide:download" size={13} />
                Download .diff
              </Button>
            </div>
            {diffNotice ? <TagFeedback notice={diffNotice} /> : null}
          </div>
        </div>
      ) : diffNotice ? (
        <TagFeedback notice={diffNotice} />
      ) : null}
      {commit.dialog}
    </EditorSection>
  );
}
