"use client";

import { Fragment, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { TOUCH_PILL } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";

/** Ties the bar toggle's `aria-controls` to the inline molecule panel region. */
export const MOLECULE_PANEL_ID = "review-molecule-panel";

/** Same contract for the citation palette. */
export const CITATION_PANEL_ID = "review-citation-panel";

/**
 * Keycap glyph rendered inside the button that owns the shortcut.
 *
 * Fine pointers only: on a touch device the keycap labels a key that does not
 * exist, in a bar that is already fighting for horizontal room.
 */
export function Kbd({ children }: { children: string }) {
  return (
    <kbd
      aria-hidden
      className="ml-0.5 hidden h-4 min-w-4 items-center justify-center rounded border border-current/25 px-1 font-sans text-[10px] leading-none opacity-60 [@media(pointer:fine)]:inline-flex"
    >
      {children}
    </kbd>
  );
}

/**
 * A one-shot progress-bar flourish, keyed so a repeat re-runs the animation.
 * "sweep" is one highlight pass (a subsection finished); "lap" runs the same
 * pass twice (a whole category finished). Purely decorative: `aria-hidden`,
 * and the reduced-motion block in utilities-theme.css zeroes it out.
 */
export interface ProgressFlourish {
  id: number;
  kind: "sweep" | "lap";
}

/** One truth for progress: reviewed over the whole public corpus, monotonic. */
export function ProgressStrip({
  reviewed,
  total,
  variant = "full",
  flourish = null,
}: {
  reviewed: number;
  total: number;
  /**
   * "hairline" is the bar treatment at every width: the same track,
   * unlabelled, welded to the bar's bottom edge, so progress stays visible
   * without spending any of the row height the one-row layout is protecting.
   * "full" is the labelled strip in the overflow sheet, where the numbers
   * live.
   */
  variant?: "full" | "hairline";
  flourish?: ProgressFlourish | null;
}) {
  const percent = total === 0 ? 0 : Math.round((reviewed / total) * 100);
  // A tick makes the fill's leading edge bloom once. Local per instance:
  // each mounted strip watches its own `reviewed` prop, so the hairline and
  // the labelled strip glow independently and an undo (a decrease) stays
  // silent. The ref update runs in an effect, after the render that compared
  // against it.
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
      aria-label="Articles reviewed"
      // The hairline is the only progress surface from `2xl`, where the
      // overflow sheet (and its labelled numbers) is gone. Hover fills in.
      title={
        variant === "hairline"
          ? `${reviewed.toLocaleString()} of ${total.toLocaleString()} reviewed — ${(total - reviewed).toLocaleString()} to go`
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
    // 10rem until xl: the strip is the one element in the bar that loses
    // nothing when narrower, so it absorbs the squeeze first.
    <div className="w-[10rem] shrink-0 xl:w-[15rem]">
      <div className="theme-text-faint mb-1 flex items-baseline justify-between text-[11px] leading-none tabular-nums">
        <span>
          {reviewed.toLocaleString()} of {total.toLocaleString()} reviewed
        </span>
        <span>{(total - reviewed).toLocaleString()} to go</span>
      </div>
      {track}
    </div>
  );
}

/** Transient bottom-right toast for tick confirmations and milestones. */
export function ReviewToast({
  tone,
  children,
}: {
  tone: "success" | "milestone";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-full border px-4 py-2.5 text-sm shadow-[var(--theme-elevation-xl)] backdrop-blur-[14px]",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2",
        tone === "success" ? "theme-review-toast-success" : "theme-review-toast-neutral",
      )}
    >
      {children}
    </div>
  );
}

/**
 * The lucide `badge-check` glyph, inlined so the tick's check stroke can draw
 * itself in. Rendered only for the tick that just happened (`lastTick` still
 * holds the slug on screen); every other reviewed state keeps the static
 * iconify icon, so revisiting an already-reviewed article stays quiet. The
 * badge pops, then the check draws, both one-shot, both zeroed out by the
 * reduced-motion block in utilities-theme.css.
 */
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

/** The "Open this article in…" menu body, shared by the bar and the sheet. */
export function OpenElsewhereItems({ slug }: { slug: string | undefined }) {
  return (
    <>
      <DropdownMenuItem asChild>
        <a href={`/${slug}`} target="_blank" rel="noreferrer">
          <Icon icon="lucide:globe" size={15} />
          Live article
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a
          href={`/dev/articles/${slug}`}
          target="_blank"
          rel="noreferrer"
        >
          <Icon icon="lucide:pencil" size={15} />
          Full substance editor
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a
          href={`/dev/molecules/${slug}`}
          target="_blank"
          rel="noreferrer"
        >
          <Icon icon="lucide:hexagon" size={15} />
          Full molecule editor
        </a>
      </DropdownMenuItem>
    </>
  );
}

/**
 * The verdict control. Icon-only below `sm`: the phone row's width goes to
 * the drug name, and the verdict stays legible as the bar's only
 * accent/success control. The labels leave the accessibility tree with
 * `hidden`, so both states carry an explicit aria-label.
 */
export function MarkReviewedControl({
  isCurrentReviewed,
  justTicked,
  hasCurrent,
  isTicking,
  toggleReviewed,
}: {
  isCurrentReviewed: boolean;
  /** The tick that just happened is this article's, so the check draws in. */
  justTicked: boolean;
  hasCurrent: boolean;
  isTicking: boolean;
  toggleReviewed: () => void;
}) {
  return isCurrentReviewed ? (
    <span className="flex items-center justify-center gap-1.5">
      <Button
        variant="success"
        size="pill"
        className={cn(
          "rounded-full px-2.5 [@media(pointer:coarse)]:min-w-11 sm:px-3.5",
          TOUCH_PILL,
        )}
        onClick={toggleReviewed}
        disabled={isTicking}
        aria-label="Reviewed — undo"
        title="Reviewed — click to undo (R)"
      >
        {justTicked ? (
          <TickedBadgeCheck />
        ) : (
          <Icon icon="lucide:badge-check" size={16} />
        )}
        <span className="hidden sm:inline">Reviewed</span>
      </Button>
      <Button
        variant="textLink"
        size="auto"
        className="hidden px-1 sm:inline-flex"
        onClick={toggleReviewed}
        disabled={isTicking}
      >
        Undo
      </Button>
    </span>
  ) : (
    <Button
      variant="accent"
      size="pill"
      className={cn(
        "rounded-full px-2.5 [@media(pointer:coarse)]:min-w-11 sm:px-4",
        TOUCH_PILL,
      )}
      onClick={toggleReviewed}
      disabled={!hasCurrent || isTicking}
      aria-label="Mark as reviewed"
      title="Mark as reviewed (R)"
    >
      <Icon
        icon={isTicking ? "lucide:loader-2" : "lucide:badge-check"}
        size={16}
        className={isTicking ? "animate-spin" : undefined}
      />
      <span className="hidden sm:inline">Mark reviewed</span>
      <Kbd>R</Kbd>
    </Button>
  );
}

const REVIEW_CRITERIA = [
  "Facts match the cited sources — nothing invented or overstated.",
  "Dosage and duration tables are sane and agree with the source material.",
  "Safety-critical sections (interactions, harm potential) read correctly.",
  "Tone and formatting match the site; no generation artifacts left behind.",
];

const SHORTCUTS: Array<[string, string]> = [
  ["←", "Previous article"],
  ["→", "Next article"],
  ["R", "Toggle reviewed"],
  ["F", "Toggle the in-progress flag"],
  ["U", "Undo the last tick"],
  ["M", "Molecule depiction panel"],
  ["C", "Citation palette"],
  ["E", "Toggle inline editing"],
  ["?", "This panel"],
];

/** "What counts as reviewed" plus the keyboard map. Shared with the sheet. */
export function ReviewHelpPanel() {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h2 className="theme-text-faint mb-2 text-xs font-semibold uppercase tracking-[0.12em]">
          What counts as reviewed
        </h2>
        <ul className="theme-text-secondary space-y-1.5 text-[13px]">
          {REVIEW_CRITERIA.map((item) => (
            <li key={item} className="flex gap-2">
              <Icon
                icon="lucide:check"
                size={14}
                className="theme-review-success-text mt-0.5 shrink-0"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="theme-text-faint mt-2 text-[12px]">
          Can&rsquo;t finish one? Flag it{" "}
          <Icon icon="lucide:flag" size={12} className="inline" /> and move on —
          it stays in the queue.
        </p>
      </div>
      <div className="hidden [@media(pointer:fine)]:block">
        <h2 className="theme-text-faint mb-2 text-xs font-semibold uppercase tracking-[0.12em]">
          Keyboard
        </h2>
        <dl className="theme-text-secondary grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
          {SHORTCUTS.map(([key, label]) => (
            <Fragment key={key}>
              <dt>
                <kbd
                  aria-hidden
                  className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-current/25 px-1 font-sans text-[10px] leading-none opacity-60"
                >
                  {key}
                </kbd>
              </dt>
              <dd>{label}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
    </div>
  );
}
