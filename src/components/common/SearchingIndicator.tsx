"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { Icon } from "./Icon";
import { useT } from "@/i18n/client";

export interface SearchingIndicatorProps {
  /** Headline copy shown before the animated ellipsis. */
  title?: string;
  /** Supporting copy under the title. */
  description?: React.ReactNode;
  /** Extra classes merged onto the centered flex stack. */
  className?: string;
}

/**
 * Animated counterpart to {@link SearchEmptyState} used while a search request
 * is in flight. It keeps the same centered icon + title + description layout so
 * it sits cleanly inside the search result panel, but makes "loading" obvious:
 *
 *  - the `line-md:search` Iconify glyph re-draws on a gentle loop (remounted via
 *    `key`, since line-md glyphs play their SMIL animation once per mount),
 *  - the icon tile emits a soft expanding accent ring,
 *  - the title gains a looping "growing dots" ellipsis.
 *
 * All motion is gated on `prefers-reduced-motion`: the JS replay loop pauses and
 * the glyph falls back to the static `lucide:search`, while the CSS dot/ring
 * animations disable themselves via media query.
 */
const ICON_REPLAY_MS = 1900;

export function SearchingIndicator({
  title,
  description,
  className,
}: SearchingIndicatorProps) {
  const t = useT();
  const resolvedTitle = title ?? t("Searching");
  const resolvedDescription =
    description === undefined ? t("Checking substances, effects, reports, and profiles.") : description;
  const prefersReducedMotion = usePrefersReducedMotion();
  const [replayKey, setReplayKey] = React.useState(0);

  React.useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }
    const intervalId = window.setInterval(() => {
      setReplayKey((value) => value + 1);
    }, ICON_REPLAY_MS);
    return () => window.clearInterval(intervalId);
  }, [prefersReducedMotion]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex min-h-44 flex-col items-center justify-center gap-3 text-center",
        className,
      )}
    >
      <span className="theme-search-suggestion-icon theme-searching-icon relative inline-flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl">
        <Icon
          key={prefersReducedMotion ? "reduced" : replayKey}
          icon={prefersReducedMotion ? "lucide:search" : "line-md:search"}
          size={40}
        />
      </span>
      <div className="space-y-1">
        <h1 className="theme-search-suggestion-title text-lg font-semibold">
          {resolvedTitle}
          <span className="theme-searching-dots" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </h1>
        {resolvedDescription ? (
          <p className="theme-search-suggestion-secondary max-w-md text-[0.8125rem] leading-5">
            {resolvedDescription}
          </p>
        ) : null}
      </div>
    </div>
  );
}
