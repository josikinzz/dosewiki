"use client";

import { useEffect, useState } from "react";

const COUNT_API = "/api/dev/trip-reports/needs-review-count";

/**
 * Last count the rail saw, kept outside React so moving between dev tools does
 * not make the badge blink away and back.
 */
let cachedCount: number | null = null;

/**
 * How many trip report submissions are waiting for an editor.
 *
 * Deliberately not part of the shell's first render path: it starts at whatever
 * a previous visit cached (or nothing), fetches in the background, and the tab
 * simply gains a badge when the answer arrives. A tool count is never worth
 * delaying the rail the editor is trying to click.
 *
 * This lives beside the shell rather than inside the Trip Report Portal so the
 * rail does not pull the tool's bundle into first paint.
 */
export function useTripReportReviewBadge(enabled: boolean): number | undefined {
  const [count, setCount] = useState<number | null>(cachedCount);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    async function loadCount() {
      try {
        const response = await fetch(COUNT_API);
        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        if (cancelled || typeof payload.count !== "number") {
          return;
        }

        cachedCount = payload.count;
        setCount(payload.count);
      } catch {
        // A missing badge is the correct failure mode: the rail still works.
      }
    }

    void loadCount();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return count === null || count <= 0 ? undefined : count;
}
