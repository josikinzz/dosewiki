"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { Icon } from "./Icon";
import { useT } from "@/i18n/client";

export interface SearchingIndicatorProps {
  title?: string;
  description?: React.ReactNode;
  className?: string;
}

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
      <span className="theme-search-suggestion-icon theme-searching-icon relative inline-flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-panel">
        <Icon
          key={prefersReducedMotion ? "reduced" : replayKey}
          icon={prefersReducedMotion ? "lucide:search" : "line-md:search"}
          size={40}
        />
      </span>
      <div className="space-y-1">
        <h1 className="theme-search-suggestion-title font-display text-lg font-semibold tracking-tight">
          {resolvedTitle}
          <span className="theme-searching-dots" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </h1>
        {resolvedDescription ? (
          <p className="theme-search-suggestion-secondary max-w-md text-sm leading-6">
            {resolvedDescription}
          </p>
        ) : null}
      </div>
    </div>
  );
}
