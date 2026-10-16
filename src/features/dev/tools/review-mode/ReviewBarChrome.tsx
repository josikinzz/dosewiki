"use client";

import { Fragment, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { TOUCH_PILL } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";
import type { DevShortcut } from "../../components/devShortcuts";

export const MOLECULE_PANEL_ID = "review-molecule-panel";

export const CITATION_PANEL_ID = "review-citation-panel";

export function Kbd({ children, className }: { children: string; className?: string }) {
  return (
    <span aria-hidden className={cn("[@media(pointer:coarse)]:hidden", className)}>
      <kbd className="theme-dev-kbd !text-current opacity-70">{children}</kbd>
    </span>
  );
}

export interface ProgressFlourish {
  id: number;
  kind: "sweep" | "lap";
}

export function ProgressStrip({
  reviewed,
  total,
  variant = "full",
  flourish = null,
}: {
  reviewed: number;
  total: number;
  variant?: "full" | "hairline";
  flourish?: ProgressFlourish | null;
}) {
  const percent = total === 0 ? 0 : Math.round((reviewed / total) * 100);
  const previousReviewedRef = useRef(reviewed);
  const [bloom, setBloom] = useState(0);
  useEffect(() => {
    if (reviewed > previousReviewedRef.current) setBloom((count) => count + 1);
    previousReviewedRef.current = reviewed;
  }, [reviewed]);
  const track = (
    <div
      className={cn(
        "theme-review-progress-track overflow-hidden",
        variant === "full" ? "h-1 rounded-full" : "h-0.5",
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={reviewed}
      aria-valuetext={`${reviewed.toLocaleString()} of ${total.toLocaleString()} reviewed`}
      aria-label="Articles reviewed"
      title={
        variant === "hairline"
          ? `${reviewed.toLocaleString()} of ${total.toLocaleString()} reviewed, ${(total - reviewed).toLocaleString()} to go`
          : undefined
      }
    >
      <div
        className={cn(
          "theme-review-progress-fill relative h-full overflow-hidden transition-[width] duration-500 motion-reduce:transition-none",
          variant === "full" && "rounded-full",
        )}
        style={{ width: `${percent}%` }}
      >
        {bloom > 0 ? (
          <span
            key={bloom}
            aria-hidden
            className="theme-review-progress-bloom pointer-events-none absolute inset-y-0 right-0 w-6"
          />
        ) : null}
        {flourish ? (
          <span
            key={flourish.id}
            aria-hidden
            className={cn(
              "theme-review-progress-sweep pointer-events-none absolute inset-0",
              flourish.kind === "lap" && "theme-review-progress-sweep--lap",
            )}
          />
        ) : null}
      </div>
    </div>
  );

  if (variant === "hairline") return track;

  return (
    <div className="w-full">
      <div className="theme-text-muted mb-1.5 flex items-baseline justify-between text-xs tabular-nums">
        <span>
          {reviewed.toLocaleString()} of {total.toLocaleString()} reviewed
        </span>
        <span>{(total - reviewed).toLocaleString()} to go</span>
      </div>
      {track}
    </div>
  );
}

function TickedBadgeCheck() {
  return (
    <svg
      aria-hidden
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="theme-review-check-pop shrink-0"
    >
      <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76" />
      <path d="m9 12 2 2 4-4" className="theme-review-check-draw" />
    </svg>
  );
}

export function OpenElsewhereItems({ slug, label = false }: { slug: string | undefined; label?: boolean }) {
  return (
    <>
      {label ? <DropdownMenuLabel className="theme-menu-label">Open {slug ? "this article" : ""} in a new tab</DropdownMenuLabel> : null}
      <DropdownMenuItem asChild>
        <a href={`/${slug}`} target="_blank" rel="noreferrer">
          <Icon icon="lucide:globe" size={15} />
          Live article
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a href={`/dev/articles/${slug}`} target="_blank" rel="noreferrer">
          <Icon icon="lucide:pencil" size={15} />
          Substances editor
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a href={`/dev/molecule-editor/substances/${slug}`} target="_blank" rel="noreferrer">
          <Icon icon="lucide:hexagon" size={15} />
          Molecules editor
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </DropdownMenuItem>
    </>
  );
}

export function MarkReviewedControl({
  isCurrentReviewed,
  justTicked,
  hasCurrent,
  isTicking,
  canSignOff,
  recommendation = null,
  confirm = false,
  toggleReviewed,
}: {
  confirm?: boolean;
  isCurrentReviewed: boolean;
  justTicked: boolean;
  hasCurrent: boolean;
  isTicking: boolean;
  canSignOff: boolean;
  recommendation?: "none" | "pending" | "stale" | null;
  toggleReviewed: () => void;
}) {
  const base = cn("gap-2 whitespace-nowrap max-sm:px-3", TOUCH_PILL);
  if (recommendation && !isCurrentReviewed) {
    return recommendation === "pending" ? (
      <Button
        variant="outline"
        className={base}
        disabled
        aria-label="Recommended reviewed: awaiting an admin"
      >
        <Icon icon="lucide:send" size={16} />
        Recommended
      </Button>
    ) : (
      <Button
        variant={hasCurrent ? "accent" : "outline"}
        className={base}
        onClick={toggleReviewed}
        disabled={!hasCurrent || isTicking}
        aria-label="Recommend as reviewed"
        aria-keyshortcuts="r"
      >
        <Icon
          icon={isTicking ? "lucide:loader-2" : "lucide:send"}
          size={16}
          className={isTicking ? "animate-spin motion-reduce:animate-none" : undefined}
        />
        {isTicking ? "Recommending" : recommendation === "stale" ? "Recommend again" : "Recommend as reviewed"}
        <Kbd>R</Kbd>
      </Button>
    );
  }
  return isCurrentReviewed ? (
    <span className="flex items-center gap-1">
      <Button
        variant="success"
        className={base}
        onClick={toggleReviewed}
        disabled={isTicking || !canSignOff}
        aria-label="Reviewed: undo"
        aria-keyshortcuts="r"
        title="Reviewed. Press to mark it not reviewed (R)"
      >
        {justTicked ? <TickedBadgeCheck /> : <Icon icon="lucide:badge-check" size={16} />}
        Reviewed
      </Button>
      {canSignOff ? (
        <Button
          variant="link"
          size="quiet"
          className="hidden px-2 sm:inline-flex"
          onClick={toggleReviewed}
          disabled={isTicking}
        >
          Mark not reviewed
        </Button>
      ) : null}
    </span>
  ) : (
    <Button
      variant={hasCurrent && canSignOff ? "accent" : "outline"}
      className={base}
      onClick={toggleReviewed}
      disabled={!hasCurrent || isTicking || !canSignOff}
      aria-label={confirm ? "Confirm reviewed" : "Mark as reviewed"}
      aria-keyshortcuts="r"
    >
      <Icon
        icon={isTicking ? "lucide:loader-2" : "lucide:badge-check"}
        size={16}
        className={isTicking ? "animate-spin motion-reduce:animate-none" : undefined}
      />
      {isTicking ? "Saving" : confirm ? "Confirm reviewed" : "Mark as reviewed"}
      <Kbd>R</Kbd>
    </Button>
  );
}

const REVIEW_CRITERIA = [
  "Facts match the cited sources, with nothing invented or overstated.",
  "Dosage and duration tables are sane and agree with the source material.",
  "Safety-critical sections (interactions, harm potential) read correctly.",
  "Tone and formatting match the site; no generation artifacts left behind.",
];

export const REVIEW_SHORTCUTS: readonly DevShortcut[] = [
  { keys: "← / →", label: "Previous or next article" },
  { keys: "k / j", label: "Previous or next article" },
  { keys: "N", label: "Next article waiting for review" },
  { keys: "/", label: "Find an article" },
  { keys: "R", label: "Mark reviewed, or mark not reviewed (editors: recommend)" },
  { keys: "U", label: "Undo the last status change" },
  { keys: "H", label: "Hold, or release a hold" },
  { keys: "F", label: "Notes and flags" },
  { keys: "M", label: "Molecule depiction panel" },
  { keys: "C", label: "Citation palette" },
  { keys: "E", label: "Inline editing" },
  { keys: "?", label: "This panel" },
  { keys: "Esc", label: "Close notes, a menu or this panel" },
];

export function ReviewHelpPanel({ recommend = false }: { recommend?: boolean } = {}) {
  const shortcuts = REVIEW_SHORTCUTS.map((shortcut) =>
    shortcut.keys === "R"
      ? { ...shortcut, label: recommend ? "Recommend as reviewed, for an admin to approve" : "Mark reviewed, or mark not reviewed" }
      : shortcut,
  );
  return (
    <div className="space-y-4 text-sm">
      <section>
        <h2 className="type-meta-label theme-text-muted mb-2">What counts as reviewed</h2>
        <ul className="theme-text-secondary space-y-1.5 text-sm">
          {REVIEW_CRITERIA.map((item) => (
            <li key={item} className="flex gap-2">
              <Icon icon="lucide:check" size={14} className="theme-review-success-text mt-1 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="theme-text-muted mt-2 text-xs leading-5">
          Cannot finish one? Hold it, say why under Notes and flags, and move on. It stays in the queue.
        </p>
      </section>
      <section className="hidden [@media(pointer:fine)]:block">
        <h2 className="type-meta-label theme-text-muted mb-2">Keyboard</h2>
        <dl className="theme-text-secondary grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-sm">
          {shortcuts.map(({ keys, label }) => (
            <Fragment key={keys}>
              <dt className="flex items-center gap-1">
                {keys.split(" / ").map((key, index) => (
                  <Fragment key={key}>
                    {index > 0 ? <span aria-hidden className="theme-text-faint text-xs">/</span> : null}
                    <kbd className="theme-dev-kbd">{key}</kbd>
                  </Fragment>
                ))}
              </dt>
              <dd>{label}</dd>
            </Fragment>
          ))}
        </dl>
      </section>
    </div>
  );
}
