import { RouteAnnouncer } from "@/components/common/RouteAnnouncer";

import type { StoryDef } from "../registry/types";

export const routeAnnouncerStory: StoryDef = {
  id: "route-announcer",
  name: "RouteAnnouncer",
  tier: "common",
  status: "stable",
  summary:
    "Visually hidden aria-live region that announces route/page changes to screen readers during client navigation.",
  source: "src/components/common/RouteAnnouncer.tsx",
  importLine: 'import { RouteAnnouncer } from "@/components/common/RouteAnnouncer";',
  exports: ["RouteAnnouncer"],
  examples: [
    {
      label: "Announcing a page title",
      note: 'Renders an sr-only role="status" live region. Nothing is visible — the message is read aloud by assistive tech.',
      background: "card",
      render: () => (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-[var(--theme-text-primary)]">
            (visually empty — announces &ldquo;2C-B&rdquo; to screen readers)
          </span>
          <RouteAnnouncer message="2C-B" />
        </div>
      ),
    },
    {
      label: "Longer descriptive message",
      note: "The message is typically the current page title or a short view description.",
      background: "subtle",
      render: () => (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-[var(--theme-text-muted)]">
            Mounted with a fuller view description string.
          </span>
          <RouteAnnouncer message="Effects index — browse subjective effects" />
        </div>
      ),
    },
  ],
  props: [
    {
      name: "message",
      type: "string",
      description:
        "Text announced to screen readers, usually the current page title or a description of the active view.",
    },
  ],
  whenToUse: [
    "Announcing client-side route/page changes for screen reader users.",
    "Pairing with SPA navigation where the document title alone is not reliably announced.",
  ],
  whenNotToUse: [
    "Any visible UI — this component is always sr-only.",
    "High-frequency or noisy status updates that would spam the polite live region.",
  ],
  notes: [
    'Renders a single sr-only div with role="status", aria-live="polite", aria-atomic="true".',
    "On message change it briefly clears then re-sets the text (~100ms) so assistive tech reliably re-announces the new value.",
    "No providers required — it is self-contained React state/effect, so it mounts live anywhere.",
  ],
};
