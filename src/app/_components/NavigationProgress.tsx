"use client";

import { useEffect, useState } from "react";
import { useNavigationPending } from "@/components/common/SmartLink";

/** How long the finish sweep stays mounted before the bar unmounts. */
const FINISH_MS = 400;

/**
 * Thin accent progress bar pinned above the header, shown while a SmartLink
 * navigation has been in flight longer than the pending-feedback delay.
 *
 * The bar is purely decorative reassurance — `RouteAnnouncer` owns the
 * accessible announcement of the route change — so it stays `aria-hidden`.
 * Motion lives in utilities-theme.css (`.theme-nav-progress`), including the
 * reduced-motion fallback (a static partial bar instead of the advance sweep).
 */
export function NavigationProgress() {
  const pending = useNavigationPending();
  const [phase, setPhase] = useState<"idle" | "active" | "done">("idle");

  useEffect(() => {
    if (pending) {
      setPhase("active");
      return;
    }
    setPhase((previous) => (previous === "active" ? "done" : previous));
    const timer = window.setTimeout(() => setPhase("idle"), FINISH_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  if (phase === "idle") return null;

  return <div aria-hidden="true" className="theme-nav-progress" data-phase={phase} />;
}
