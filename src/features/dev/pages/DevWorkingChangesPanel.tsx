"use client";

import { useId, useState, type ReactNode, type RefObject } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { TOUCH_HALO } from "@/components/ui/touchTargets";
import { DiffPreview } from "@/features/dev/components/DiffPreview";
import { EditorSection, Notice, useWriteFreeze } from "@/features/dev/components";
import { cn } from "@/lib/utils";

import type { DevCommitControls } from "./useDevModeSaveActions";

const PROPOSAL_ID_DISPLAY_LENGTH = 6;

export type DevWorkingChangesDiff = {
  markdown: string;
  hasChanges: boolean;
  onCopy: () => void;
  onDownload: () => void;
  disabled?: boolean;
  feedback?: ReactNode;
};

export type DevWorkingChangesPanelProps = {
  commit: DevCommitControls;
  id: string;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  pendingSummary: string;
  idleSummary: string;
  summaryNote?: ReactNode;
  changes?: ReactNode;
  describeFailure?: (message: string) => { message: ReactNode; actions?: ReactNode } | null;
  diff?: DevWorkingChangesDiff;
  saveKeyLabel: string;
  onCommit: () => void;
  className?: string;
};

export function DevWorkingChangesPanel({
  commit,
  id,
  headingRef,
  pendingSummary,
  idleSummary,
  summaryNote,
  changes,
  describeFailure,
  diff,
  saveKeyLabel,
  onCommit,
  className,
}: DevWorkingChangesPanelProps) {
  const [diffOpen, setDiffOpen] = useState(false);
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
  const pending = commit.hasPendingChanges;
  const hasDiff = Boolean(diff && diff.hasChanges && diff.markdown.trim().length > 0);
  const buttonLabel = production
    ? commit.isSaving ? "Committing" : "Commit to production"
    : commit.isSaving ? "Submitting" : "Submit for review";
  const failure = shownNotice?.type === "error" && !frozen && describeFailure
    ? describeFailure(shownNotice.message)
    : null;

  return (
    <EditorSection
      id={id}
      icon="lucide:layers"
      title={<span ref={headingRef} tabIndex={-1} className="outline-none">Working changes</span>}
      className={cn("scroll-mt-24", className)}
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
          {pending ? pendingSummary : idleSummary}
        </p>
        {summaryNote ? <p className="theme-text-muted text-xs">{summaryNote}</p> : null}
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
          tone={shownNotice.type === "error" ? (failure ? "warning" : "danger") : shownNotice.type === "pending" ? "loading" : "success"}
          dismiss={shownNotice.type === "pending" ? undefined : () => {
            setReceipt(null);
            commit.dismissNotice();
          }}
          autoClearMs={null}
          actions={failure?.actions ?? (shownNotice.actionHref ? (
            <Button asChild variant="outline" size="xs">
              <a href={shownNotice.actionHref} target="_blank" rel="noreferrer">
                {shownNotice.actionLabel ?? "Open"}
              </a>
            </Button>
          ) : undefined)}
        >
          {shownNotice.type === "error" && frozen
            ? `Writes are paused, so your changes were not ${production ? "committed" : "submitted"}. They stay in your working changes.`
            : failure?.message ?? shownNotice.message}
        </Notice>
      ) : null}

      {changes}

      {diff && hasDiff ? (
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
            <DiffPreview diffText={diff.markdown} maxHeight={320} />
            <div role="group" aria-label="Diff actions" className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="xs" onClick={diff.onCopy} disabled={!diff.hasChanges || diff.disabled}>
                <Icon icon="lucide:copy" size={13} />
                Copy diff
              </Button>
              <Button type="button" variant="outline" size="xs" onClick={diff.onDownload} disabled={!diff.hasChanges || diff.disabled}>
                <Icon icon="lucide:download" size={13} />
                Download .diff
              </Button>
            </div>
            {diff.feedback ?? null}
          </div>
        </div>
      ) : diff?.feedback ?? null}
      {commit.dialog}
    </EditorSection>
  );
}
