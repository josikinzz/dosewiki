"use client";

import { useEffect, useLayoutEffect, useState } from "react";

import { DoseWikiLogo } from "@/components/common/DoseWikiLogo";
import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

import styles from "./ViewerBufferingIndicator.module.css";

interface ViewerBufferingIndicatorProps {
  phase: "startup" | "rebuffer" | null;
  canPlayNow: boolean;
  onPlayNow: () => void;
  mediaKey: string;
}

/** Only the indicator resets on a work change, never the pooled media element. */
export function ViewerBufferingIndicator(props: ViewerBufferingIndicatorProps) {
  return <BufferingSession key={props.mediaKey} {...props} />;
}

function BufferingSession({
  phase,
  canPlayNow,
  onPlayNow,
}: ViewerBufferingIndicatorProps) {
  const [displayedPhase, setDisplayedPhase] =
    useState<ViewerBufferingIndicatorProps["phase"]>(null);
  const [pageHidden, setPageHidden] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const updateVisibility = () => setPageHidden(document.hidden);
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useLayoutEffect(() => {
    if (phase === null) {
      const timeout = window.setTimeout(() => setDisplayedPhase(null), 160);
      return () => window.clearTimeout(timeout);
    }

    setDisplayedPhase(null);
    const timeout = window.setTimeout(() => setDisplayedPhase(phase), 250);
    return () => window.clearTimeout(timeout);
  }, [phase]);

  if (
    displayedPhase === null ||
    (phase !== null && phase !== displayedPhase) ||
    (phase === null && reducedMotion)
  ) {
    return null;
  }

  const buffering = phase !== null;
  const running = buffering && !pageHidden && !reducedMotion;

  return (
    <div
      className={`theme-chrome-dark ${styles.indicator}`}
      data-phase={displayedPhase}
      data-running={running}
      data-buffering={buffering}
      data-reduced-motion={reducedMotion}
      aria-hidden={!buffering || pageHidden}
      hidden={pageHidden}
    >
      <div className={styles.content}>
        <div className={styles.markFrame} aria-hidden="true">
          {displayedPhase === "startup" && !reducedMotion ? (
            <div className={`theme-icon-accent ${styles.washClip}`}>
              <div className={styles.wash} />
            </div>
          ) : null}
          <DoseWikiLogo
            ariaHidden
            className={styles.mark}
            width={40}
            height={40}
          />
        </div>
        <div role="status" aria-live="off" className={styles.label}>
          {displayedPhase === "startup" ? "Loading video" : "Buffering"}
        </div>
        {buffering && canPlayNow ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={styles.playNow}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onTouchEnd={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onKeyUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onPlayNow();
            }}
          >
            Play now
          </Button>
        ) : null}
      </div>
    </div>
  );
}
