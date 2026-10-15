"use client";

import { useEffect } from "react";
import type { PostHog } from "posthog-js";
import {
  isPostHogEnabled,
  POSTHOG_API_HOST,
  POSTHOG_PROJECT_KEY,
  POSTHOG_UI_HOST,
} from "@server/next/analyticsHostPolicy";

let postHogStarted = false;

const IDLE_FALLBACK_MS = 1_000;
const IDLE_TIMEOUT_MS = 2_000;

type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions,
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

export function ApprovedPublicAnalytics({ host }: { host?: string }) {
  useEffect(() => {
    if (postHogStarted || !isPostHogEnabled(host ?? window.location.host)) {
      return;
    }

    const idleWindow = window as IdleWindow;
    let cancelled = false;
    let loaded = document.readyState === "complete";
    let frameHandle: number | undefined;
    let idleHandle: number | undefined;
    let fallbackHandle: number | undefined;
    let importInFlight = false;
    let importedPostHog: PostHog | undefined;

    const clearScheduledWork = () => {
      if (frameHandle !== undefined) {
        window.cancelAnimationFrame(frameHandle);
        frameHandle = undefined;
      }
      if (idleHandle !== undefined) {
        idleWindow.cancelIdleCallback?.(idleHandle);
        idleHandle = undefined;
      }
      if (fallbackHandle !== undefined) {
        clearTimeout(fallbackHandle);
        fallbackHandle = undefined;
      }
    };

    const initializeOrImport = () => {
      if (
        cancelled ||
        postHogStarted ||
        document.visibilityState !== "visible"
      ) {
        return;
      }

      if (importedPostHog) {
        postHogStarted = true;
        importedPostHog.init(POSTHOG_PROJECT_KEY, {
          api_host: POSTHOG_API_HOST,
          ui_host: POSTHOG_UI_HOST,
          defaults: "2025-05-24",
          capture_pageview: "history_change",
          capture_pageleave: true,
          autocapture: false,
          disable_session_recording: true,
          disable_surveys: true,
          capture_exceptions: false,
          disable_external_dependency_loading: true,
          persistence: "localStorage",
          respect_dnt: true,
        });
        return;
      }

      if (importInFlight) {
        return;
      }
      importInFlight = true;

      void import("posthog-js").then(({ default: posthog }) => {
        if (cancelled || postHogStarted) {
          return;
        }
        importInFlight = false;
        importedPostHog = posthog;
        if (document.visibilityState === "visible") {
          initializeOrImport();
        }
      });
    };

    const scheduleAfterPaint = () => {
      if (
        cancelled ||
        postHogStarted ||
        !loaded ||
        document.visibilityState !== "visible" ||
        frameHandle !== undefined ||
        idleHandle !== undefined ||
        fallbackHandle !== undefined ||
        importInFlight
      ) {
        return;
      }

      frameHandle = window.requestAnimationFrame(() => {
        frameHandle = undefined;
        if (
          cancelled ||
          postHogStarted ||
          document.visibilityState !== "visible"
        ) {
          return;
        }

        if (idleWindow.requestIdleCallback) {
          idleHandle = idleWindow.requestIdleCallback(
            () => {
              idleHandle = undefined;
              initializeOrImport();
            },
            { timeout: IDLE_TIMEOUT_MS },
          );
        } else {
          fallbackHandle = window.setTimeout(() => {
            fallbackHandle = undefined;
            initializeOrImport();
          }, IDLE_FALLBACK_MS);
        }
      });
    };

    const handleLoad = () => {
      loaded = true;
      scheduleAfterPaint();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearScheduledWork();
        return;
      }
      scheduleAfterPaint();
    };

    window.addEventListener("load", handleLoad);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    scheduleAfterPaint();

    return () => {
      cancelled = true;
      clearScheduledWork();
      window.removeEventListener("load", handleLoad);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [host]);

  return null;
}
