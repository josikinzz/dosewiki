import { LoadingScreen } from "@/components/common/LoadingScreen";

import type { StoryDef } from "../registry/types";

export const loadingScreenStory: StoryDef = {
  id: "loading-screen",
  name: "LoadingScreen",
  tier: "common",
  status: "stable",
  summary:
    "Full-screen public loading state: themed gradient shell, spinning dose.wiki logo, and an animated progress bar shown while public articles bootstrap.",
  source: "src/components/common/LoadingScreen.tsx",
  importLine: 'import { LoadingScreen } from "@/components/common/LoadingScreen";',
  exports: ["LoadingScreen"],
  examples: [
    {
      label: "Full loading screen",
      note: "Mounted live inside a clipped, relative frame so its fixed inset-0 positioning is scoped to this preview instead of covering the page.",
      background: "plain",
      full: true,
      render: () => (
        <div className="relative h-[26rem] w-full overflow-hidden rounded-xl border border-[var(--theme-border-subtle)]">
          <LoadingScreen />
        </div>
      ),
    },
    {
      label: "Compact frame",
      note: "Same component in a shorter frame — content stays centered and the spinner/progress bar keep animating.",
      background: "plain",
      full: true,
      render: () => (
        <div className="relative h-56 w-full overflow-hidden rounded-xl border border-[var(--theme-border-subtle)]">
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
    "Public route-level loading fallback while server-side Convex article data is being fetched.",
    "Any full-screen, branded \"preparing the library\" hold state on the public site.",
  ],
  whenNotToUse: [
    "Inline or in-card loading — use a Skeleton or a small spinner, not a full-screen overlay.",
    "Editor/dev surfaces — this carries public-facing copy and branding.",
  ],
  notes: [
    "Renders fixed inset-0 with theme-page-shell, so in real use it covers the entire viewport; the previews wrap it in a relative overflow-hidden frame to scope that positioning.",
    "Self-contained: it injects its own loading-bar keyframes via an inline <style> and pulls branding from DoseWikiLogo. No props, no providers, no data.",
  ],
};
