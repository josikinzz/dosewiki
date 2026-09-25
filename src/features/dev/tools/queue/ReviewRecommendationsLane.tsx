"use client";

/**
 * Change Review's Review recommendations lane (admins only): editors'
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

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  EditorCheckbox,
  EditorNotice,
  EditorSection,
  EditorStatusPill,
  useConfirm,
  type EditorNoticeMessage,
} from "@/features/dev/components";
import { MISSING_TASK_TITLE } from "@/features/dev/tools/missingTask";
import { buildReviewUrl } from "../review-mode/reviewUrl";
import { formatProposalDate, type RecommendationApproval, type ReviewRecommendationRow } from "./queueModel";
import { approveReviewRecommendations, fetchReviewRecommendations } from "./queueRequests";

const articleCount = (count: number) => `${count} ${count === 1 ? "article" : "articles"}`;

function approvalNotice(outcome: RecommendationApproval): EditorNoticeMessage {
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

export function ReviewRecommendationsLane({ linkedSlug = null }: { linkedSlug?: string | null } = {}) {
  const [rows, setRows] = useState<ReviewRecommendationRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const [approving, setApproving] = useState(false);
  const loadVersion = useRef(0);
  const { confirm, dialog } = useConfirm();
  /** Whether the linked recommendation was found on the first list: null until it loads. */
  const [linkFound, setLinkFound] = useState<boolean | null>(null);
  const linkApplied = useRef(false);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoadError(null);
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
  const chosen = approvable.filter((row) => selected.has(row.slug));
  const allChosen = approvable.length > 0 && chosen.length === approvable.length;

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
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The approval did not go through." });
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
      affected: items.map((row) => row.title),
      onConfirm: () => approve(items),
    });
  };

  return (
    <EditorSection
      icon="lucide:badge-check"
      title="Review recommendations"
      description={
        rows
          ? `${approvable.length} ready to approve · ${rows.length - approvable.length} changed since recommended`
          : loadError
            ? "Not loaded"
            : "Loading"
      }
      actions={
        rows && approvable.length > 0 ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={approving}
              onClick={() => setSelected(allChosen ? new Set() : new Set(approvable.map((row) => row.slug)))}
            >
              {allChosen ? "Clear selection" : "Select all ready"}
            </Button>
            <Button type="button" variant="accent" size="sm" disabled={approving || chosen.length === 0} onClick={confirmApprove}>
              {approving ? "Approving..." : `Approve selected (${chosen.length})`}
            </Button>
          </div>
        ) : null
      }
    >
      {notice ? <EditorNotice notice={{ ...notice, live: true }} /> : null}
      {linkFound === false ? (
        <EditorNotice
          notice={{
            tone: "warning",
            title: MISSING_TASK_TITLE,
            message: "The link names a review recommendation that was approved, withdrawn, or is not yours to open. Nothing else was selected in its place.",
          }}
        />
      ) : null}
      {loadError ? (
        <EditorNotice
          notice={{
            tone: "danger",
            title: "Review recommendations could not be loaded",
            message: loadError,
            actions: (
              <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                Try again
              </Button>
            ),
          }}
        />
      ) : null}
      {rows === null && !loadError ? (
        <EditorStatusPill tone="info" loading live>
          Loading review recommendations...
        </EditorStatusPill>
      ) : null}
      {rows && rows.length === 0 ? (
        <p className="theme-text-muted text-sm">
          No recommendations are waiting. Editors recommend an article with R in the review workbench.
        </p>
      ) : null}
      {rows && rows.length > 0 ? (
        <ul className="space-y-2" aria-label="Review recommendations">
          {rows.map((row) => (
            <li
              key={row.slug}
              data-testid={`recommendation-${row.slug}`}
              aria-current={row.slug === linkedSlug ? "true" : undefined}
              className={`flex items-start justify-between gap-3${row.slug === linkedSlug ? " rounded-lg ring-1 ring-[var(--theme-accent-strong)] ring-offset-4 ring-offset-transparent" : ""}`}
            >
              <EditorCheckbox
                checked={!row.stale && selected.has(row.slug)}
                disabled={row.stale || approving}
                onChange={() => toggle(row.slug)}
                aria-label={`Approve ${row.title}`}
                label={<span className="theme-text-primary font-medium">{row.title}</span>}
                description={
                  <>
                    {`Recommended by ${row.recommended_by} · ${formatProposalDate(row.recommended_at)}`}
                    {row.note ? <span className="block">{`"${row.note}"`}</span> : null}
                  </>
                }
              />
              {row.stale ? (
                <span className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <EditorStatusPill tone="caution">Stale</EditorStatusPill>
                  <span className="theme-text-muted text-xs">Changed since recommended.</span>
                  <a className="text-xs font-medium underline underline-offset-2" href={buildReviewUrl({ slug: row.slug })}>
                    Review again
                  </a>
                </span>
              ) : (
                <EditorStatusPill tone="info">Ready</EditorStatusPill>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {dialog}
    </EditorSection>
  );
}
