"use client";

import { useEffect, useRef } from "react";

/**
 * Explicit-render Turnstile loader. The widget only mounts when the deployment
 * sets `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (the form checks before rendering this
 * component), so builds without the key ship no Cloudflare script at all.
 * `challenges.cloudflare.com` is allowlisted for script-src/frame-src in
 * `lib/next/cspObservationPolicy.ts`.
 */
const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileRenderOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
  theme: "auto" | "light" | "dark";
};

type TurnstileApi = {
  render: (element: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileLoader: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }
  if (!turnstileLoader) {
    turnstileLoader = new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.onload = () => {
        if (window.turnstile) {
          resolve(window.turnstile);
        } else {
          reject(new Error("Turnstile script loaded without exposing its API."));
        }
      };
      script.onerror = () => {
        // Allow a later mount to retry after a transient network failure.
        turnstileLoader = null;
        reject(new Error("Turnstile script failed to load."));
      };
      document.head.appendChild(script);
    });
  }
  return turnstileLoader;
}

interface TurnstileWidgetProps {
  siteKey: string;
  /** Receives the fresh token, or `null` when the token expires or errors. */
  onToken: (token: string | null) => void;
  /**
   * Turnstile tokens are single-use: bump this after every completed POST so
   * the widget issues a fresh challenge for the next submission.
   */
  resetSignal?: number;
}

export function TurnstileWidget({ siteKey, onToken, resetSignal = 0 }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled) return;
        widgetIdRef.current = turnstile.render(container, {
          sitekey: siteKey,
          theme: "auto",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        if (!cancelled) onTokenRef.current(null);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetSignal > 0 && widgetIdRef.current !== null) {
      onTokenRef.current(null);
      window.turnstile?.reset(widgetIdRef.current);
    }
  }, [resetSignal]);

  return <div ref={containerRef} />;
}
