"use client";

import { useEffect } from "react";

/**
 * How long to keep waiting for a hash target to appear. Client-fetched
 * articles (effect pages) mount their content well after load; past this
 * point a missing id is a bad link, not a slow one.
 */
const TARGET_WAIT_MS = 8000;

/**
 * Settle times after load + fonts before re-measuring the target. Two passes:
 * the first catches font/hydration drift, the second the stragglers (images
 * and client-fetched sections above the target that finish laying out late).
 */
const SETTLE_PASSES_MS = [150, 1200];

/**
 * Makes deep links actually land. The browser's native jump-to-fragment runs
 * once, against the first layout — which this app has two ways of betraying:
 *
 * 1. Client-fetched articles (effect pages) don't contain the target id at
 *    load at all, so the native jump silently does nothing.
 * 2. Server-rendered articles keep laying out after the jump — fonts, images,
 *    deferred sections — so the reader ends up offset from the heading.
 *
 * This watches for the hash target to exist and the page to settle, then
 * performs one instant corrective jump (`scroll-margin-top` still applies).
 * The moment the reader scrolls or touches anything themselves, it stands
 * down — a correction is not worth yanking the page out from under them.
 *
 * Mounted by `StickyTocLayout`, so every table-of-contents page gets it.
 */
export function AnchorScrollRestore() {
  useEffect(() => {
    const raw = window.location.hash.slice(1);
    if (!raw) {
      return;
    }
    let hash: string;
    try {
      hash = decodeURIComponent(raw);
    } catch {
      hash = raw;
    }

    let cancelled = false;
    let disposed = false;
    const cancel = () => {
      cancelled = true;
    };
    const interactionEvents = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    for (const event of interactionEvents) {
      window.addEventListener(event, cancel, { passive: true, once: true });
    }

    const timers: number[] = [];
    let observer: MutationObserver | null = null;

    const cleanup = () => {
      disposed = true;
      for (const event of interactionEvents) {
        window.removeEventListener(event, cancel);
      }
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
      observer?.disconnect();
    };

    const jump = (target: HTMLElement) => {
      if (cancelled || disposed) {
        return;
      }
      // Instant, not smooth: this is a correction of where the reader already
      // asked to be, not a navigation they should watch happen.
      target.scrollIntoView({ behavior: "auto", block: "start" });
    };

    const settleThenJump = (target: HTMLElement) => {
      const correct = () => {
        if (cancelled || disposed) {
          return;
        }
        const top = target.getBoundingClientRect().top;
        const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
        const drift = Math.abs(top - margin);
        // An untouched scroll position with the target below the fold means
        // the native jump never ran — the article mounted after load (client
        // -fetched pages), so the fragment had nothing to land on. Jump.
        const neverJumped = window.scrollY === 0 && top > window.innerHeight;
        // Otherwise correct only within a viewport of the target: the native
        // jump happened and layout drifted. Further away, the browser
        // restored a previous reading position on reload; leave it be.
        if (neverJumped || (drift > 1 && drift < window.innerHeight)) {
          jump(target);
        }
      };
      const settled = Promise.all([
        document.readyState === "complete"
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              window.addEventListener("load", () => resolve(), { once: true });
            }),
        document.fonts?.ready?.then(() => undefined) ?? Promise.resolve(),
      ]);
      void settled.then(() => {
        for (const delay of SETTLE_PASSES_MS) {
          timers.push(window.setTimeout(correct, delay));
        }
      });
    };

    const initial = document.getElementById(hash);
    if (initial) {
      settleThenJump(initial);
      return cleanup;
    }

    // Target not in the document yet — the article body is still being
    // fetched, and the browser's native jump has already come up empty. Jump
    // as soon as it exists; that jump was never performed, so no drift guard.
    observer = new MutationObserver(() => {
      const target = document.getElementById(hash);
      if (!target) {
        return;
      }
      observer?.disconnect();
      observer = null;
      // Two frames so the newly mounted content completes its first layout.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => jump(target));
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    timers.push(
      window.setTimeout(() => {
        observer?.disconnect();
        observer = null;
      }, TARGET_WAIT_MS),
    );

    return cleanup;
  }, []);

  return null;
}
