/**
 * Full-screen loading indicator shown while articles are loading.
 *
 * Matches the app's dark gradient background with animated spinner.
 */

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { DoseWikiLogo } from "./DoseWikiLogo";

export function LoadingScreen() {
  return (
    <div className="theme-page-shell fixed inset-0 flex flex-col items-center justify-center">
      {/* Background blur effects */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-fuchsia-600/14 blur-2xl" />
        <div className="absolute top-40 -right-20 h-80 w-80 rounded-full bg-violet-600/14 blur-2xl" />
      </div>

      {/* Content */}
      <div className="flex flex-col items-center gap-6">
        {/* Spinning logo */}
        <div className="relative">
          <DoseWikiLogo
            width={80}
            height={80}
            className="h-20 w-20 animate-spin"
            style={{ animationDuration: "3s" }}
            draggable={false}
          />
          {/* Glow effect */}
          <div className="absolute inset-0 -z-10 h-20 w-20 rounded-full bg-fuchsia-500/30 blur-xl" />
        </div>

        {/* Text */}
        <div className="flex flex-col items-center gap-2">
          <span
            className={`text-2xl font-display font-bold tracking-tight ${SITE_FLAVOR_CONFIG.loadingScreen.wordmarkClassName}`}
          >
            {SITE_FLAVOR_CONFIG.name}
          </span>
          <span className="theme-text-muted text-sm">{SITE_FLAVOR_CONFIG.loadingScreen.statusLine}</span>
          <span className="theme-text-faint text-xs uppercase tracking-[0.24em]">{SITE_FLAVOR_CONFIG.loadingScreen.captionLine}</span>
        </div>

        {/* Loading bar */}
        <div className="theme-loading-track mt-2 h-1 w-48 overflow-hidden rounded-full">
          <div
            className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500"
            style={{
              animation: "loading-bar 1.5s ease-in-out infinite",
            }}
          />
        </div>
      </div>

      {/* CSS for loading bar animation */}
      <style>{`
        @keyframes loading-bar {
          0% {
            transform: translateX(-100%);
          }
          50% {
            transform: translateX(100%);
          }
          100% {
            transform: translateX(-100%);
          }
        }
      `}</style>
    </div>
  );
}
