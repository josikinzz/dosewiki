"use client";

import { useEffect, useState } from "react";
import { useNavigationPending } from "@/components/common/SmartLink";

/** How long the finish sweep stays mounted before the bar unmounts. */
const FINISH_MS = 400;

/**
 * Thin accent progress bar pinned above the header, shown from the moment a
 * SmartLink navigation starts until it commits.
 *
 * The bar is purely decorative reassurance — `RouteAnnouncer` owns the
 * accessible announcement of the route change — so it stays `aria-hidden`.
 * Motion lives in utilities-theme.css (`.theme-nav-progress`), including the
 * reduced-motion fallback (a static partial bar instead of the advance sweep).
 *
 * While the bar is active the root element also carries
 * `data-nav-pending="true"`, so surfaces anywhere on the page (the beta
 * disclaimer's shimmer, for one) can quiet themselves in CSS for the same
 * window without threading pending state through props.
 */
export function NavigationProgress() {
  const pending = useNavigationPending();
  const [phase, setPhase] = useState<"idle" | "active" | "done">("idle");

  useEffect(() => {
    const root = document.documentElement;
    if (pending) root.setAttribute("data-nav-pending", "true");
    else root.removeAttribute("data-nav-pending");
    return () => root.removeAttribute("data-nav-pending");
  }, [pending]);

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
