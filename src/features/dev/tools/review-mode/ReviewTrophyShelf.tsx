"use client";

import { useState } from "react";

import { Icon } from "@/components/common/Icon";
import { getCategoryIcon } from "@/data/config/categoryIcons";
import { cn } from "@/lib/utils";
import {
  UNPLACED_GROUP_KEY,
  type ReviewQueueEntry,
  type ReviewQueueGroup,
} from "./reviewQueue";

function allEntries(group: ReviewQueueGroup): ReviewQueueEntry[] {
  return [
    ...group.sections.flatMap((section) => section.entries),
    ...group.entries,
  ];
}

/**
 * One medallion per psychoactive category, lit emerald once every article in
 * the class is reviewed. Derived live from the queue's own counts — never
 * stored — so an undo un-earns a trophy as honestly as a tick earned it. The
 * unplaced bucket is not a class, so it earns nothing and is not listed.
 */
export function ReviewTrophyShelf({
  groups,
  collapsible = false,
}: {
  groups: readonly ReviewQueueGroup[];
  /** Fold the shelf behind its heading, closed by default — for hosts where
      space is contested (the overflow sheet). The heading keeps the earned
      count visible either way. */
  collapsible?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const open = !collapsible || expanded;
  const shelf = groups
    .filter((group) => group.key !== UNPLACED_GROUP_KEY)
    .map((group) => {
      const entries = allEntries(group);
      const reviewed = entries.filter(
        (entry) => entry.status === "completed",
      ).length;
      return {
        key: group.key,
        label: group.label,
        icon: getCategoryIcon(group.iconKey ?? group.key),
        reviewed,
        total: entries.length,
        earned: entries.length > 0 && reviewed === entries.length,
      };
    });
  const earned = shelf.filter((trophy) => trophy.earned).length;

  return (
    <div className="space-y-3">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="theme-focus-ring-inset -mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded-xl px-1 text-left transition hover:bg-dose-surface-muted [@media(pointer:coarse)]:min-h-11"
        >
          <span className="flex items-center gap-1.5">
            <Icon
              icon={expanded ? "lucide:chevron-down" : "lucide:chevron-right"}
              size={14}
              className="theme-text-faint shrink-0"
            />
            <h2 className="theme-text-faint text-xs font-semibold uppercase tracking-[0.12em]">
              Class trophies
            </h2>
          </span>
          <span className="theme-text-faint text-[11px] tabular-nums">
            {earned} of {shelf.length} earned
          </span>
        </button>
      ) : (
        <div className="flex items-baseline justify-between">
          <h2 className="theme-text-faint text-xs font-semibold uppercase tracking-[0.12em]">
            Class trophies
          </h2>
          <span className="theme-text-faint text-[11px] tabular-nums">
            {earned} of {shelf.length} earned
          </span>
        </div>
      )}
      {open ? (
        <>
          <ul className="space-y-1">
            {shelf.map((trophy) => (
              <li key={trophy.key} className="flex items-center gap-2.5 py-0.5">
                <span
                  className={cn(
                    "theme-review-trophy-medallion flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                    trophy.earned && "theme-review-trophy-medallion--earned",
                  )}
                >
                  <Icon icon={trophy.icon} size={15} />
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[13px] font-medium",
                    trophy.earned ? "theme-text-primary" : "theme-text-secondary",
                  )}
                >
                  {trophy.label}
                </span>
                {trophy.earned ? (
                  <span
                    className="theme-review-seal inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-semibold tabular-nums"
                    title={`All ${trophy.total} reviewed`}
                  >
                    <Icon icon="lucide:check" size={10} />
                    {trophy.total}
                  </span>
                ) : (
                  <span className="theme-text-faint shrink-0 text-[11px] tabular-nums">
                    {trophy.reviewed}/{trophy.total}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="theme-text-faint text-[11px] leading-tight">
            A trophy lights up when every article in its class is reviewed.
          </p>
        </>
      ) : null}
    </div>
  );
}
