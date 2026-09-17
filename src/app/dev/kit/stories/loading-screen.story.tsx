import { LoadingScreen } from "@/components/common/LoadingScreen";

import type { StoryDef } from "../registry/types";

export const loadingScreenStory: StoryDef = {
  id: "loading-screen",
  name: "LoadingScreen",
  tier: "common",
  status: "stable",
  summary:
    "Full-screen branded loading state: themed shell, breathing dose.wiki logo, a theme-tokened indeterminate bar, and a stalled hint after four seconds.",
  source: "src/components/common/LoadingScreen.tsx",
  importLine: 'import { LoadingScreen } from "@/components/common/LoadingScreen";',
  exports: ["LoadingScreen"],
  examples: [
    {
      label: "Full loading screen",
      note: "Mounted live inside a clipped frame that carries a transform, so it is the containing block for the fixed inset-0 shell and the preview stays inside it instead of covering the page.",
      background: "plain",
      full: true,
      render: () => (
        <div className="relative h-[26rem] w-full overflow-hidden rounded-card border border-[var(--theme-border-subtle)] [transform:translateZ(0)]">
          <LoadingScreen />
        </div>
      ),
    },
    {
      label: "Compact frame",
      note: "Same component in a shorter frame — content stays centered and the logo/progress bar keep animating.",
      background: "plain",
      full: true,
      render: () => (
        <div className="relative h-56 w-full overflow-hidden rounded-card border border-[var(--theme-border-subtle)] [transform:translateZ(0)]">
          <LoadingScreen />
        </div>
      ),
    },
  ],
  props: [
    {
      name: "(none)",
      type: "—",
      description: "Takes no props; renders a fixed full-screen overlay with its own copy and animations.",
    },
  ],
  whenToUse: [
    "A genuine full-screen, branded boot hold with no page chrome to keep up.",
  ],
  whenNotToUse: [
    "Inline or in-card loading — use a Skeleton or a small spinner, not a full-screen overlay.",
    "Section loads where the shell can stay up — use RouteLoading / PublicSkeletonSurface so the load reads as the page assembling. Route navigations show no skeleton at all; NavigationProgress carries them.",
    "Editor/dev surfaces — this carries public-facing copy and branding.",
  ],
  notes: [
    "Renders fixed inset-0 with theme-page-shell, so in real use it covers the entire viewport; the previews wrap it in a relative overflow-hidden frame to scope that positioning.",
    "Announces as role=status aria-live=polite; the stalled hint fades in after 4s via theme-loading-stalled-label. All keyframes live in src/styles/utilities-theme.css and honour prefers-reduced-motion (static logo, half-filled bar).",
    "Self-contained otherwise: branding from DoseWikiLogo, copy from SITE_FLAVOR_CONFIG.loadingScreen. No props, no providers, no data.",
  ],
};
