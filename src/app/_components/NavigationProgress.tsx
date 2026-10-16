"use client";

import { useEffect, useState } from "react";
import { useNavigationPending } from "@/components/common/SmartLink";

const FINISH_MS = 400;

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
