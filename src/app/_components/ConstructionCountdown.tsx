"use client";

import { useEffect, useState } from "react";
import {
  formatLaunchCountdown,
  getLaunchCountdown,
  LAUNCH_AT_LABEL,
} from "@/utils/launchCountdown";

/**
 * The holding page's clock to the launch floor.
 *
 * The landing is statically prerendered and then served from the edge for as long as the
 * cache holds it, so the server has no useful "now" to render: the first paint shows the
 * launch instant as a label, and the clock takes over on mount. That is also what keeps
 * hydration clean — server and client agree on the first render by construction, instead of
 * agreeing by luck about which second it is.
 *
 * The ticking value is hidden from assistive technology. A per-second live region would
 * interrupt a screen reader continuously and say nothing the static sentence beside it does
 * not already say.
 */
export function ConstructionCountdown() {
  const [label, setLabel] = useState<string>(LAUNCH_AT_LABEL);

  useEffect(() => {
    const tick = () => {
      const countdown = getLaunchCountdown(Date.now());
      setLabel(countdown ? formatLaunchCountdown(countdown) : LAUNCH_AT_LABEL);
    };

    tick();
    const timer = window.setInterval(tick, 1000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className="theme-home-construction-countdown text-xs font-semibold uppercase leading-none tracking-[0.24em] tabular-nums sm:text-sm">
      <span className="sr-only">Launching {LAUNCH_AT_LABEL}.</span>
      <span aria-hidden="true">{label}</span>
    </span>
  );
}
