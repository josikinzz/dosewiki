"use client";

import { useEffect, useLayoutEffect, useState } from "react";

import { DoseWikiLogo } from "@/components/common/DoseWikiLogo";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useT } from "@/i18n/client";

import styles from "./ViewerBufferingIndicator.module.css";

interface ViewerBufferingIndicatorProps {
  phase: "startup" | "rebuffer" | null;
  /** Lean the label with the stage media, the way the chrome iconography does. */
  rotated?: boolean;
  mediaKey: string;
}

/** Only the indicator resets on a work change, never the pooled media element. */
export function ViewerBufferingIndicator(props: ViewerBufferingIndicatorProps) {
  return <BufferingSession key={props.mediaKey} {...props} />;
}

function BufferingSession({
  phase,
  rotated = false,
}: ViewerBufferingIndicatorProps) {
  const t = useT();
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
      data-rotated={rotated}
      aria-hidden={!buffering || pageHidden}
      hidden={pageHidden}
    >
      <div className={styles.content}>
        <div className={styles.markFrame} aria-hidden="true">
          <DoseWikiLogo
            ariaHidden
            className={styles.mark}
            width={40}
            height={40}
          />
        </div>
        <div role="status" aria-live="off" className={styles.label}>
          <span>{t("Loading")}</span>
          {/* Three dots that breathe 1-2-3-2; the word carries the meaning. */}
          <span className={styles.ellipsis} aria-hidden="true">
            <span className={styles.dot}>.</span>
            <span className={styles.dot}>.</span>
            <span className={styles.dot}>.</span>
          </span>
        </div>
      </div>
    </div>
  );
}
