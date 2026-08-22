"use client";

import { useEffect } from "react";
import {
  isPostHogEnabled,
  POSTHOG_API_HOST,
  POSTHOG_PROJECT_KEY,
  POSTHOG_UI_HOST,
} from "@server/next/analyticsHostPolicy";

// `posthog.init` is process-wide, so a remount must not re-run it. The layout renders this
// component once per document, but tests and Fast Refresh both mount it repeatedly.
let postHogStarted = false;

export function ApprovedPublicAnalytics({ host }: { host?: string }) {
  useEffect(() => {
    if (postHogStarted || !isPostHogEnabled(host ?? window.location.host)) {
      return;
    }

    let cancelled = false;

    // Dynamic on purpose: a static import would bundle posthog-js into the shared client
    // chunk this root-layout component sits in, shipping it to the admin surface, every
    // Vercel preview and the Effect Index build — all of which must never load it. The
    // lazy chunk is only ever fetched after the host gate above passes.
    void import("posthog-js").then(({ default: posthog }) => {
      if (cancelled || postHogStarted) {
        return;
      }
      postHogStarted = true;

      posthog.init(POSTHOG_PROJECT_KEY, {
        api_host: POSTHOG_API_HOST,
        ui_host: POSTHOG_UI_HOST,
        defaults: "2025-05-24",
        // Traffic analytics only. Client-side navigations are captured from history changes,
        // so App Router route transitions count without a router-event subscription.
        capture_pageview: "history_change",
        capture_pageleave: true,
        // Everything below is deliberately off. This is a harm-reduction encyclopedia: which
        // substance pages a reader opens is health-adjacent, so per-interaction and
        // per-session detail stays out of the pipeline entirely.
        autocapture: false,
        disable_session_recording: true,
        disable_surveys: true,
        capture_exceptions: false,
        // Guarantees no remote <script> is injected, which is what keeps analytics out of
        // `script-src` altogether in `lib/next/cspObservationPolicy.ts`.
        disable_external_dependency_loading: true,
        // No cookies: the visitor id never rides on an HTTP request header.
        persistence: "localStorage",
        respect_dnt: true,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [host]);

  return null;
}
