"use client";

/**
 * Change Review's Review recommendations view (admins only): editors'
 * "Recommended reviewed" records, approved many at a time behind one confirm.
 * Approval writes `completed` at the revision each recommendation covered. A
 * stale recommendation (the article was published again since) cannot be
 * selected; it links to /review for a fresh read instead.
 *
 * A task link (`/dev/queue?recommendation=<slug>`, as the Inbox opens one)
 * picks its recommendation out: the row is marked and scrolled into view, and
 * ticked when it can be approved. Approving still asks first. A link whose
 * recommendation is gone says so rather than showing the lane as if nothing
 * was asked for.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { TOUCH_HALO } from "@/components/ui/touchTargets";
import {
  EditorCheckbox,
  EditorPanel,
  EditorStatusPill,
  LoadErrorState,
  Notice,
  useConfirm,
  useWriteFreeze,
  type NoticeMessage,
} from "@/features/dev/components";
import { MISSING_TASK_TITLE } from "@/features/dev/tools/missingTask";
import { formatReviewerIdentity } from "@/features/dev/tools/reviewerIdentity";
import { cn } from "@/lib/utils";
import { buildReviewUrl } from "../review-mode/reviewUrl";
import { ProposalTime } from "./ProposalReview";
import type { RecommendationApproval, ReviewRecommendationRow } from "./queueModel";
import {
  QUEUE_FREEZE_COPY,
  approveReviewRecommendations,
  fetchReviewRecommendations,
  isWriteFreezeError,
} from "./queueRequests";

const articleCount = (count: number) => `${count} ${count === 1 ? "article" : "articles"}`;

const recommender = (row: ReviewRecommendationRow) => formatReviewerIdentity(row.recommended_by) ?? row.recommended_by;

function approvalNotice(outcome: RecommendationApproval): NoticeMessage {
  const approved = outcome.approved.length;
  const skipped = outcome.stale.length + outcome.missing.length;
  if (skipped === 0) {
    return { tone: "success", message: `Marked ${articleCount(approved)} reviewed.` };
  }
  const parts = [
    outcome.stale.length ? `${articleCount(outcome.stale.length)} changed since recommended and need another review` : null,
    outcome.missing.length ? `${articleCount(outcome.missing.length)} no longer had that recommendation` : null,
  ].filter(Boolean);
  return {
    tone: "warning",
    title: approved ? `Marked ${articleCount(approved)} reviewed` : "Nothing was approved",
    message: `${parts.join("; ")}. Those were left as they were.`,
  };
}

export type ReviewRecommendationsLaneProps = {
  linkedSlug?: string | null;
  /** How many are ready to approve once the list loads; null while unknown. */
  onReadyCountChange?: (count: number | null) => void;
};

export function ReviewRecommendationsLane({ linkedSlug = null, onReadyCountChange }: ReviewRecommendationsLaneProps = {}) {
  const [rows, setRows] = useState<ReviewRecommendationRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [approving, setApproving] = useState(false);
  const loadVersion = useRef(0);
  const { confirm, dialog } = useConfirm();
  const { frozen } = useWriteFreeze();
  /** Whether the linked recommendation was found on the first list: null until it loads. */
  const [linkFound, setLinkFound] = useState<boolean | null>(null);
  const linkApplied = useRef(false);
  const readyCountRef = useRef(onReadyCountChange);
  useEffect(() => {
    readyCountRef.current = onReadyCountChange;
  });

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoadError(null);
    setLoading(true);
    try {
      const next = await fetchReviewRecommendations();
      if (version !== loadVersion.current) return;
      setRows(next);
      // A selection never outlives its row or survives the row going stale.
      const approvable = new Set(next.filter((row) => !row.stale).map((row) => row.slug));
      setSelected((previous) => new Set([...previous].filter((slug) => approvable.has(slug))));
      if (linkedSlug && !linkApplied.current) {
        linkApplied.current = true;
        setLinkFound(next.some((row) => row.slug === linkedSlug));
        if (approvable.has(linkedSlug)) setSelected((previous) => new Set([...previous, linkedSlug]));
      }
    } catch (error) {
      if (version === loadVersion.current) {
        setLoadError(error instanceof Error ? error.message : "Unable to load review recommendations.");
      }
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [linkedSlug]);

  // Bring the linked row into view once it is on screen.
  useEffect(() => {
    if (!linkFound || !linkedSlug) return;
    const rowId = `recommendation-${linkedSlug}`;
    [...document.querySelectorAll("[data-testid^='recommendation-']")]
      .find((element) => element.getAttribute("data-testid") === rowId)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [linkFound, linkedSlug]);

  useEffect(() => {
    void load();
    return () => {
      ++loadVersion.current;
    };
  }, [load]);

  const approvable = rows?.filter((row) => !row.stale) ?? [];
  const stale = rows?.filter((row) => row.stale) ?? [];
  const chosen = approvable.filter((row) => selected.has(row.slug));
  const allChosen = approvable.length > 0 && chosen.length === approvable.length;

  useEffect(() => {
    readyCountRef.current?.(rows ? rows.filter((row) => !row.stale).length : null);
  }, [rows]);

  const toggle = (slug: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const approve = async (items: ReviewRecommendationRow[]) => {
    setApproving(true);
    setNotice(null);
    try {
      const outcome = await approveReviewRecommendations(items.map(({ slug, revision }) => ({ slug, revision })));
      setNotice(approvalNotice(outcome));
      await load();
    } catch (error) {
      setNotice({
        tone: "danger",
        message: isWriteFreezeError(error) || frozen
          ? QUEUE_FREEZE_COPY
          : error instanceof Error ? error.message : "The approval did not go through.",
      });
    } finally {
      setApproving(false);
    }
  };

  const confirmApprove = () => {
    if (chosen.length === 0) return;
    const items = chosen;
    confirm({
      title: `Mark ${articleCount(items.length)} reviewed?`,
      description:
        "Each article is signed off at the version the editor recommended, with you as the reviewer, and shows as reviewed on the public site. An article published again since then is left for another review.",
      confirmLabel: `Approve ${items.length}`,
      // Who recommended each one and why stay in view at the moment of sign-off.
      body: (
        <ul className="theme-dev-link-list max-h-64 overflow-y-auto text-sm">
          {items.map((row) => (
            <li key={row.slug} className="py-2">
              <p className="theme-text-primary font-medium">{row.title}</p>
              <p className="theme-text-muted text-xs">Recommended by {recommender(row)}</p>
              {row.note ? <p className="theme-text-secondary mt-1 text-xs">“{row.note}”</p> : null}
            </li>
          ))}
        </ul>
      ),
      onConfirm: () => approve(items),
    });
  };

  const summary = rows
    ? `${approvable.length} ready to approve, ${stale.length} changed since recommended`
    : loadError
      ? "Not loaded"
      : "Loading";

  return (
    <EditorPanel className="overflow-visible">
      <header className="theme-portal-rule space-y-2 border-b px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h3 className="theme-accent-heading text-lg font-semibold">Review recommendations</h3>
          <div className="-mr-2 flex items-center gap-2">
            <p className="theme-text-muted hidden text-xs tabular-nums sm:block" aria-live="polite">
              {summary}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={loading || approving}
              aria-busy={loading || undefined}
              onClick={() => void load()}
            >
              <Icon icon="lucide:refresh-cw" size={14} className={cn(loading && rows && "motion-safe:animate-spin")} />
              {loading && rows ? "Refreshing" : "Refresh"}
            </Button>
          </div>
        </div>
        <p className="theme-text-muted text-xs tabular-nums sm:hidden">{summary}</p>
        <p className="theme-text-secondary max-w-prose text-sm">
          Editors mark an article reviewed with R in the review workbench. Approving signs it off at the version they
          recommended, with you as the reviewer.
        </p>
      </header>

      <div className="space-y-5 px-4 py-4 sm:px-5">
        {linkFound === false ? (
          <Notice
            tone="warning"
            title={MISSING_TASK_TITLE}
            message="The link names a review recommendation that was approved, withdrawn, or is not yours to open. Nothing else was selected in its place."
          />
        ) : null}
        {loadError ? (
          <LoadErrorState what="review recommendations" message={loadError} onRetry={() => void load()} busy={loading} />
        ) : null}
        {rows === null && !loadError ? <RowSkeletons /> : null}
        {rows && rows.length === 0 ? (
          <p className="theme-text-secondary flex items-start gap-2 text-sm">
            <Icon icon="lucide:circle-check" size={16} className="theme-icon-accent mt-0.5 shrink-0" />
            <span>
              All clear. No recommendations are waiting. Editors recommend an article with R in the review workbench.
            </span>
          </p>
        ) : null}
        {rows && rows.length > 0 ? (
          <ul className="space-y-5" aria-label="Review recommendations">
            <RecommendationGroup label="Ready to approve" count={approvable.length}>
              {approvable.map((row) => (
                <RecommendationRow
                  key={row.slug}
                  row={row}
                  linked={row.slug === linkedSlug}
                  checked={selected.has(row.slug)}
                  disabled={approving}
                  onToggle={() => toggle(row.slug)}
                />
              ))}
            </RecommendationGroup>
            {stale.length > 0 ? (
              <RecommendationGroup label="Changed since recommended" count={stale.length}>
                {stale.map((row) => (
                  <RecommendationRow key={row.slug} row={row} linked={row.slug === linkedSlug} checked={false} disabled onToggle={() => undefined} />
                ))}
              </RecommendationGroup>
            ) : null}
          </ul>
        ) : null}
      </div>

      {rows && (approvable.length > 0 || notice) ? (
        <footer
          className="theme-portal-rule sticky bottom-0 z-10 space-y-2.5 rounded-b-[inherit] border-t bg-[var(--editor-panel-bg)]/95 px-4 py-3 backdrop-blur sm:px-5"
          aria-label="Approve recommendations"
        >
          {notice ? <Notice placement="inline" {...notice} dismiss={() => setNotice(null)} /> : null}
          {approving ? (
            <p className="theme-text-muted flex items-center gap-2 text-sm" role="status" aria-live="polite">
              <Icon icon="lucide:loader-circle" size={14} className="motion-safe:animate-spin" />
              Approving {articleCount(chosen.length)}
            </p>
          ) : null}
          {frozen && !notice ? (
            <p className="theme-text-muted flex items-center gap-2 text-xs">
              <Icon icon="lucide:circle-pause" size={13} className="theme-warning-text-strong shrink-0" />
              Writes are paused right now; an approval will not save until they resume.
            </p>
          ) : null}
          {approvable.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="accent" size="sm" disabled={approving || chosen.length === 0} onClick={confirmApprove}>
                {approving ? "Approving" : `Approve selected (${chosen.length})`}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={approving}
                onClick={() => setSelected(allChosen ? new Set() : new Set(approvable.map((row) => row.slug)))}
              >
                {allChosen ? "Clear selection" : "Select all ready"}
              </Button>
              <p className="theme-text-muted text-xs tabular-nums">
                {chosen.length === 0 ? "Tick the articles to sign off." : `${chosen.length} of ${approvable.length} selected`}
              </p>
            </div>
          ) : null}
        </footer>
      ) : null}
      {dialog}
    </EditorPanel>
  );
}

function RecommendationGroup({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  return (
    <li className="space-y-1">
      <h4 className="theme-text-secondary flex items-center justify-between gap-3 text-sm font-semibold">
        <span>{label}</span>
        <span className="theme-text-muted font-normal tabular-nums">{count}</span>
      </h4>
      <ul className="theme-dev-link-list">{children}</ul>
    </li>
  );
}

/**
 * One recommendation: the tick, the article, who recommended it and when,
 * their note, and a way to read the article in Review first. A stale one is
 * marked and offers only another review.
 */
function RecommendationRow({
  row,
  linked,
  checked,
  disabled,
  onToggle,
}: {
  row: ReviewRecommendationRow;
  linked: boolean;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      data-testid={`recommendation-${row.slug}`}
      aria-current={linked ? "true" : undefined}
      className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-control px-2.5 py-3", linked && "theme-dev-link-lead")}
    >
      <EditorCheckbox
        checked={!row.stale && checked}
        disabled={row.stale || disabled}
        onChange={onToggle}
        aria-label={`Approve ${row.title}`}
        className="mt-0.5 [@media(pointer:coarse)]:size-5"
        containerClassName="min-w-0 flex-1 basis-64"
        label={<span className="theme-text-primary font-semibold">{row.title}</span>}
        description={
          <>
            <span className="block">
              Recommended by {recommender(row)}, <ProposalTime iso={row.recommended_at} />
            </span>
            {row.note ? <span className="theme-text-secondary mt-1 block max-w-prose">“{row.note}”</span> : null}
          </>
        }
      />
      <span className="ml-7 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 sm:ml-0">
        {row.stale ? (
          <>
            <EditorStatusPill tone="caution">Stale</EditorStatusPill>
            <span className="theme-text-muted text-xs">Changed since recommended.</span>
            <a
              className={cn("text-dose-accent-strong theme-accent-underline text-sm font-medium underline-offset-4 hover:underline", TOUCH_HALO)}
              href={buildReviewUrl({ slug: row.slug })}
            >
              Review again
            </a>
          </>
        ) : (
          <>
            <EditorStatusPill tone="info">Ready</EditorStatusPill>
            <a
              className={cn("text-dose-accent-strong theme-accent-underline text-sm underline-offset-4 hover:underline", TOUCH_HALO)}
              href={buildReviewUrl({ slug: row.slug })}
            >
              Open in Review
            </a>
          </>
        )}
      </span>
    </li>
  );
}

function RowSkeletons() {
  return (
    <div aria-busy="true" className="space-y-1">
      <span className="sr-only">Loading review recommendations</span>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} aria-hidden className="space-y-2 rounded-xl px-3 py-3 [background:var(--theme-frosted-control-on-panel-bg)]">
          <span className="theme-skeleton-pulse block h-3.5 rounded-chip" style={{ width: `${48 - index * 8}%` }} />
          <span className="theme-skeleton-pulse block h-3 w-2/5 rounded-chip" />
        </div>
      ))}
    </div>
  );
}
