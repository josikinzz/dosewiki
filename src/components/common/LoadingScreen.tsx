/**
 * Full-screen branded loading state shown while a client surface bootstraps.
 *
 * Announces itself as a polite live status, breathes the static logo instead
 * of spinning it, sweeps a theme-tokened indeterminate bar, and surfaces a
 * stalled hint after four seconds — mirroring the route skeleton system's
 * accessibility and reduced-motion behaviour (see PublicFeedbackPrimitives).
 * All animation lives in `src/styles/utilities-theme.css`.
 */

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { DoseWikiLogo } from "./DoseWikiLogo";

export function LoadingScreen() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="theme-page-shell fixed inset-0 flex flex-col items-center justify-center"
    >
      <div className="flex flex-col items-center gap-6">
        <DoseWikiLogo
          width={80}
          height={80}
          className="theme-loading-logo motion-reduce:animate-none h-20 w-20"
          draggable={false}
        />

        <div className="flex flex-col items-center gap-2">
          <span
            className={`theme-loading-wordmark text-2xl font-display font-bold tracking-tight ${SITE_FLAVOR_CONFIG.loadingScreen.wordmarkClassName}`}
          >
            {SITE_FLAVOR_CONFIG.name}
          </span>
          <span className="theme-text-muted text-sm">{SITE_FLAVOR_CONFIG.loadingScreen.statusLine}</span>
          <span className="theme-text-faint text-xs uppercase tracking-[0.24em]">
            {SITE_FLAVOR_CONFIG.loadingScreen.captionLine}
          </span>
        </div>

        <div className="theme-loading-track mt-2 h-1 w-48 overflow-hidden rounded-full" aria-hidden="true">
          <div className="theme-loading-bar motion-reduce:animate-none" />
        </div>

        <p className="theme-loading-stalled-label theme-text-muted text-xs">
          Still loading. Refresh if the page does not appear.
        </p>
      </div>
    </div>
  );
}
