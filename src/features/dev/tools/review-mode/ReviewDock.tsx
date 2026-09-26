"use client";

import type { ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { EditorStatusPill } from "@/features/dev/components";
import type { ReviewState } from "@/schema/substance/editorial";
import { cn } from "@/lib/utils";
import { describeProgress, REVIEW_FREEZE_COPY, REVIEW_STATE_TONE, reviewStateLabel } from "./reviewDockModel";

/**
 * The review dock: the decision dock recipe for a read-and-tick workbench,
 * pinned to the bottom of the screen (the phone thumb zone) under the article
 * the reviewer is reading. Rows, top to bottom: the notes drawer when it is
 * open, the result of the last review write (with Undo), the freeze line, and
 * one row holding where this article's review stands (state, who signed it
 * off or what this role may do, progress) beside the decisions.
 */
export function ReviewDock({
  state,
  credit,
  roleLine,
  reviewed,
  total,
  result,
  frozen,
  notes,
  actions,
}: {
  state: ReviewState | null;
  credit: ReactNode;
  roleLine: ReactNode;
  reviewed: number;
  total: number;
  result: ReactNode;
  frozen: boolean;
  notes: ReactNode;
  actions: ReactNode;
}) {
  return (
    <footer
      role="region"
      aria-label="Review"
      className="theme-review-dock sticky bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto w-full max-w-[1500px] space-y-2.5 px-3 py-2.5 sm:px-5">
        {notes}
        {result}
        {frozen ? (
          <p className="theme-text-secondary flex items-center gap-2 text-sm">
            <Icon icon="lucide:circle-pause" size={14} className="theme-warning-text shrink-0" aria-hidden />
            {REVIEW_FREEZE_COPY} Ticks and flags wait until writes resume.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-72 space-y-0.5">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {state ? (
                <EditorStatusPill inline tone={REVIEW_STATE_TONE[state]}>
                  {reviewStateLabel(state)}
                </EditorStatusPill>
              ) : null}
              {credit}
              <span data-testid="review-progress-text" className="theme-text-faint text-xs tabular-nums">
                {describeProgress(reviewed, total)}
              </span>
            </p>
            {roleLine ? <p className="theme-text-muted text-xs leading-5">{roleLine}</p> : null}
          </div>
          <div className={cn("flex items-center gap-2 max-sm:w-full max-sm:gap-1.5 [&>*:last-child]:max-sm:flex-1")}>
            {actions}
          </div>
        </div>
      </div>
    </footer>
  );
}
