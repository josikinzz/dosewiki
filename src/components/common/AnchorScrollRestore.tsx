"use client";

import { useEffect } from "react";

const TARGET_WAIT_MS = 8000;

const SETTLE_PASSES_MS = [150, 1200];

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
        const neverJumped = window.scrollY === 0 && top > window.innerHeight;
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

    observer = new MutationObserver(() => {
      const target = document.getElementById(hash);
      if (!target) {
        return;
      }
      observer?.disconnect();
      observer = null;
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
