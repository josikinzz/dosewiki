/**
 * Full-screen loading indicator shown while articles are loading.
 *
 * Matches the app's dark gradient background with animated spinner.
 */

import logoDataUri from "../../assets/dosewiki-logo.svg?inline";

export function LoadingScreen() {
  const isSafari =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("is-safari");
  const logoSrc = isSafari ? "/dosewiki-logo.png" : logoDataUri;

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#0b0818] via-[#130e2b] to-[#0f0a1f] text-white">
      {/* Background blur effects */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="absolute top-40 -right-24 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
      </div>

      {/* Content */}
      <div className="flex flex-col items-center gap-6">
        {/* Spinning logo */}
        <div className="relative">
          <img
            src={logoSrc}
            alt="dose.wiki logo"
            className="h-20 w-20 animate-spin"
            style={{ animationDuration: "3s" }}
            draggable={false}
          />
          {/* Glow effect */}
          <div className="absolute inset-0 -z-10 h-20 w-20 rounded-full bg-fuchsia-500/30 blur-xl" />
        </div>

        {/* Text */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-2xl font-display font-bold tracking-tight text-fuchsia-300">
            dose.wiki
          </span>
          <span className="text-sm text-white/60">Loading substance data...</span>
        </div>

        {/* Loading bar */}
        <div className="mt-2 h-1 w-48 overflow-hidden rounded-full bg-white/10">
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
