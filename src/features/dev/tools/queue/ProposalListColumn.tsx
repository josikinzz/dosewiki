"use client";

import { useState, type ReactNode, type RefObject } from "react";

import { ExpandButton } from "@/components/common/ExpandButton";
import { HighlightedText } from "@/components/common/HighlightedText";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditorSegmentedControl, EditorStatusPill } from "@/features/dev/components";
import { formatReviewerIdentity } from "@/features/dev/tools/reviewerIdentity";
import { cn } from "@/lib/utils";

import { ProposalTime } from "./ProposalReview";
import {
  QUEUE_HISTORY_CAP,
  STATUS_LABELS,
  STATUS_PILL_TONE,
  describeTargets,
  type GroupedProposals,
  type ProposalHold,
  type ProposalSummary,
} from "./queueModel";
import type { QueueView } from "./queueTaskLink";

export type QueueEmpty =
  | { kind: "none" }
  | { kind: "clear" }
  | { kind: "mine" }
  | { kind: "search"; query: string; elsewhere: number };

export type ProposalListColumnProps = {
  listRef: RefObject<HTMLElement | null>;
  headingId: string;
  canApprove: boolean;
  countLine: string;
  refreshing: boolean;
  onRefresh: () => void;
  busy: boolean;
  view: QueueView | null;
  myPendingCount: number | null;
  onViewChange: (view: QueueView | null) => void;
  searchId: string;
  searchRef: RefObject<HTMLInputElement | null>;
  search: string;
  onSearchChange: (value: string) => void;
  loaded: boolean;
  groups: GroupedProposals;
  selectedId: string | null;
  onSelect: (id: string) => void;
  holdOf: (row: ProposalSummary) => ProposalHold | null;
  empty: QueueEmpty | null;
  onShowEverything: () => void;
  onClearSearch: () => void;
  onward: ReactNode;
  error: ReactNode;
  freshness: ReactNode;
};

export function ProposalListColumn(props: ProposalListColumnProps) {
  const {
    listRef,
    headingId,
    canApprove,
    countLine,
    refreshing,
    onRefresh,
    busy,
    view,
    myPendingCount,
    onViewChange,
    searchId,
    searchRef,
    search,
    onSearchChange,
    loaded,
    groups,
    empty,
    error,
    freshness,
  } = props;
  const firstHistoryGroup = groups.find((group) => group.id === "applied" || group.id === "closed")?.id;

  return (
    <section ref={listRef} aria-labelledby={headingId} className="scroll-mt-24 space-y-3 lg:sticky lg:top-24">
      <div className="flex items-center justify-between gap-3">
        <h3 id={headingId} className="type-meta-label theme-text-muted">
          {canApprove ? "Proposals" : "Your proposals"}
        </h3>
        <div className="flex items-center gap-2">
          <p className="theme-text-muted text-xs tabular-nums" aria-live="polite">
            {countLine}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-mr-2"
            onClick={onRefresh}
            disabled={refreshing || busy}
            aria-busy={refreshing || undefined}
          >
            <Icon icon="lucide:refresh-cw" size={14} className={cn(refreshing && "motion-safe:animate-spin")} />
            {refreshing ? "Refreshing" : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <EditorSegmentedControl
          label="Submissions view"
          options={[
            { value: "all", label: "All" },
            { value: "mine", label: "My pending", ...(myPendingCount !== null ? { badge: String(myPendingCount) } : {}) },
          ]}
          value={view ?? "all"}
          onChange={(value) => onViewChange(value === "mine" ? "mine" : null)}
        />
      </div>

      <div className="relative">
        <Icon
          icon="lucide:search"
          size={15}
          className="theme-text-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        />
        <Input
          ref={searchRef}
          id={searchId}
          type="search"
          inputSize="sm"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && search) {
              event.preventDefault();
              onSearchChange("");
            }
          }}
          placeholder="Search by summary, person or item"
          aria-label="Search proposals"
          aria-keyshortcuts="/"
          className="pl-9 pr-9"
        />
        {search ? null : (
          <span
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 [@media(pointer:coarse)]:hidden"
          >
            <kbd className="theme-dev-kbd">/</kbd>
          </span>
        )}
      </div>

      {freshness}
      {error}

      {!loaded ? (
        error ? null : <ListSkeleton />
      ) : empty ? (
        <EmptyList {...props} empty={empty} />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.id} className="space-y-1.5">
              {group.id === firstHistoryGroup ? (
                <p className="type-meta-label theme-text-faint theme-portal-rule border-t pt-4">History</p>
              ) : null}
              <ProposalGroup {...props} group={group} />
            </div>
          ))}
        </div>
      )}

      <p className="theme-text-faint hidden text-xs [@media(pointer:fine)]:block">
        <kbd className="theme-dev-kbd">j</kbd> <kbd className="theme-dev-kbd">k</kbd> move,{" "}
        {canApprove ? (
          <>
            <kbd className="theme-dev-kbd">a</kbd> approve, <kbd className="theme-dev-kbd">r</kbd> reject,{" "}
          </>
        ) : null}
        <kbd className="theme-dev-kbd">/</kbd> search, <kbd className="theme-dev-kbd">?</kbd> every key
      </p>
    </section>
  );
}

function ProposalGroup({
  group,
  selectedId,
  onSelect,
  busy,
  canApprove,
  search,
  holdOf,
}: ProposalListColumnProps & { group: GroupedProposals[number] }) {
  const [expanded, setExpanded] = useState(false);
  const history = group.id === "applied" || group.id === "closed";
  const capped = history && !expanded && group.rows.length > QUEUE_HISTORY_CAP;
  const shown = capped
    ? group.rows.filter((row, index) => index < QUEUE_HISTORY_CAP || row._id === selectedId)
    : group.rows;
  const listId = `queue-group-${group.id}-rows`;
  const mixed = group.statuses.length > 1;

  return (
    <section aria-label={group.label} data-testid={`queue-group-${group.id}`} className="space-y-1">
      <h4 className="flex items-center justify-between gap-3">
        <span className="type-meta-label theme-text-muted">{group.label}</span>
        <span className="theme-text-faint text-xs font-normal tabular-nums" data-testid={`queue-group-${group.id}-count`}>
          {group.rows.length}
        </span>
      </h4>
      <ul id={listId} className="theme-dev-link-list -mx-2.5">
        {shown.map((row) => (
          <li key={row._id}>
            <ProposalRow
              row={row}
              active={row._id === selectedId}
              disabled={busy}
              onSelect={() => onSelect(row._id)}
              showProposer={canApprove}
              showStatus={mixed}
              query={search}
              hold={holdOf(row)}
            />
          </li>
        ))}
      </ul>
      {history && group.rows.length > QUEUE_HISTORY_CAP ? (
        <ExpandButton
          variant="count"
          count={group.rows.length - QUEUE_HISTORY_CAP}
          label={expanded ? "Show fewer" : "Show all"}
          isExpanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
          ariaControls={listId}
          ariaLabel={expanded ? `Show fewer ${group.label.toLowerCase()} proposals` : `Show all ${group.rows.length} ${group.label.toLowerCase()} proposals`}
        />
      ) : null}
    </section>
  );
}

function ProposalRow({
  row,
  active,
  disabled,
  onSelect,
  showProposer,
  showStatus,
  query,
  hold,
}: {
  row: ProposalSummary;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
  showProposer: boolean;
  showStatus: boolean;
  query: string;
  hold: ProposalHold | null;
}) {
  const holder =
    hold?.kind === "mine" ? "You are reviewing" : hold?.kind === "other" ? `Claimed by ${formatReviewerIdentity(hold.by) ?? hold.by}` : null;
  const comments = row.commentCount;
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-current={active ? "true" : undefined}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "theme-dev-link-row flex min-h-11 w-full flex-col gap-1 rounded-control px-2.5 py-2.5 text-left text-sm transition-colors disabled:cursor-wait motion-reduce:transition-none",
        active && "theme-dev-link-lead",
      )}
    >
      <span className="flex w-full items-start justify-between gap-3">
        <span className={cn("min-w-0 font-semibold leading-snug", active ? "theme-accent-heading" : "theme-text-primary")}>
          <HighlightedText text={row.summary || "Untitled proposal"} query={query} />
        </span>
        {showStatus ? (
          <EditorStatusPill inline tone={STATUS_PILL_TONE[row.status]}>
            {STATUS_LABELS[row.status]}
          </EditorStatusPill>
        ) : null}
      </span>
      <span className="theme-text-muted flex w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
        {showProposer ? (
          <>
            <HighlightedText className="theme-text-secondary font-medium" text={row.isAuthor ? "You" : row.proposerName} query={query} />
            <span aria-hidden>·</span>
          </>
        ) : null}
        <ProposalTime iso={row.createdAt} />
        <span aria-hidden>·</span>
        <HighlightedText text={describeTargets(row.targets)} query={query} />
        {comments > 0 ? (
          <>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Icon icon="lucide:message-square" size={12} />
              {comments}
              <span className="sr-only">{comments === 1 ? " comment" : " comments"}</span>
            </span>
          </>
        ) : null}
        {holder ? (
          <>
            <span aria-hidden>·</span>
            <span className={hold?.kind === "mine" ? "theme-text-primary" : "theme-text-secondary"}>{holder}</span>
          </>
        ) : null}
      </span>
    </button>
  );
}

function EmptyList({
  empty,
  canApprove,
  onShowEverything,
  onClearSearch,
  onward,
}: ProposalListColumnProps & { empty: QueueEmpty }) {
  let icon = "lucide:search-x";
  let message: ReactNode;
  let action: ReactNode = null;
  switch (empty.kind) {
    case "none":
      icon = "lucide:inbox";
      message = (
        <>
          <span className="theme-text-primary block font-medium">
            {canApprove ? "No submissions to review." : "You have not submitted any changes yet."}
          </span>
          <span className="block">Use Submit for review in any editor to start a review. Nothing is published until an admin approves it.</span>
        </>
      );
      action = onward;
      break;
    case "clear":
      icon = "lucide:circle-check";
      message = "All clear. No proposal is waiting on review or revision.";
      break;
    case "mine":
      message = "None of your proposals is waiting on a decision or a revision.";
      action = (
        <Button type="button" variant="link" size="auto" className="text-sm" onClick={onShowEverything}>
          Show everything
        </Button>
      );
      break;
    case "search":
      message = `No proposal matches “${empty.query.trim()}”${empty.elsewhere > 0 ? `; ${empty.elsewhere} more ${empty.elsewhere === 1 ? "matches" : "match"} outside My pending` : ""}.`;
      action = (
        <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {empty.elsewhere > 0 ? (
            <Button type="button" variant="link" size="auto" className="text-sm" onClick={onShowEverything}>
              Show everything
            </Button>
          ) : null}
          <Button type="button" variant="link" size="auto" className="text-sm" onClick={onClearSearch}>
            Clear the search
          </Button>
        </span>
      );
      break;
  }
  return (
    <div className="rounded-card border border-dashed border-[color:var(--editor-panel-border)] px-4 py-5 text-sm">
      <p className="theme-text-secondary flex items-start gap-2">
        <Icon
          icon={icon}
          size={16}
          className={cn("mt-0.5 shrink-0", empty.kind === "clear" ? "theme-icon-accent" : "theme-text-faint")}
        />
        <span className="space-y-1">{message}</span>
      </p>
      {action ? <div className="ml-6 mt-3">{action}</div> : null}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" className="space-y-1">
      <span className="sr-only">Loading proposals</span>
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          aria-hidden
          className="space-y-2 rounded-xl px-3 py-3 [background:var(--theme-frosted-control-on-panel-bg)]"
        >
          <span className="theme-skeleton-pulse block h-3.5 rounded-chip" style={{ width: `${72 - index * 9}%` }} />
          <span className="theme-skeleton-pulse block h-3 w-2/5 rounded-chip" />
        </div>
      ))}
    </div>
  );
}
