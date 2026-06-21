import { StatusOrb } from "@/components/common/StatusOrb";

import type { StoryDef } from "../registry/types";

const TONES = ["accent", "success", "warning", "danger", "neutral"] as const;

export const statusOrbStory: StoryDef = {
  id: "status-orb",
  name: "StatusOrb",
  tier: "common",
  status: "stable",
  summary:
    "Decorative ringed status badge with a centered Icon. Used as a hero glyph for empty states, status panels, and onboarding callouts.",
  source: "src/components/common/StatusOrb.tsx",
  importLine: 'import { StatusOrb } from "@/components/common/StatusOrb";',
  exports: ["StatusOrb"],
  examples: [
    {
      label: "Tones",
      note: "Five semantic tones, driven by the data-tone attribute and theme tokens.",
      render: () => (
        <div className="flex flex-wrap items-center gap-4">
          {TONES.map((tone) => (
            <StatusOrb key={tone} tone={tone} icon="lucide:sparkles" />
          ))}
        </div>
      ),
    },
    {
      label: "Sizes",
      note: "sm / md / lg scale both the orb and its icon together.",
      render: () => (
        <div className="flex flex-wrap items-end gap-4">
          <StatusOrb size="sm" tone="accent" icon="lucide:flask-conical" />
          <StatusOrb size="md" tone="accent" icon="lucide:flask-conical" />
          <StatusOrb size="lg" tone="accent" icon="lucide:flask-conical" />
        </div>
      ),
    },
    {
      label: "Icons",
      note: "Any Iconify name works; pass lucide:* or custom:* glyphs.",
      render: () => (
        <div className="flex flex-wrap items-center gap-4">
          <StatusOrb tone="success" icon="lucide:check" />
          <StatusOrb tone="warning" icon="lucide:triangle-alert" />
          <StatusOrb tone="danger" icon="lucide:octagon-alert" />
          <StatusOrb tone="neutral" icon="lucide:search" />
        </div>
      ),
    },
    {
      label: "Loading",
      note: "data-loading drives the animated pulse on the rings.",
      render: () => (
        <div className="flex flex-wrap items-center gap-4">
          <StatusOrb tone="accent" loading icon="lucide:loader" />
          <StatusOrb tone="neutral" loading icon="lucide:loader" />
        </div>
      ),
    },
    {
      label: "On a card surface",
      background: "card",
      note: "The orb is purely decorative (aria-hidden); pair it with real text.",
      render: () => (
        <div className="flex items-center gap-4">
          <StatusOrb tone="warning" size="lg" icon="lucide:file-question" />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-[var(--theme-text-primary)]">
              No results yet
            </span>
            <span className="text-xs text-[var(--theme-text-muted)]">
              Try widening your filters.
            </span>
          </div>
        </div>
      ),
    },
  ],
  props: [
    {
      name: "icon",
      type: "IconName (string)",
      default: '"lucide:sparkles"',
      description: "Iconify name for the centered glyph (lucide:* or custom:*).",
    },
    {
      name: "tone",
      type: '"accent" | "success" | "warning" | "danger" | "neutral"',
      default: '"accent"',
      description: "Semantic color, set via the data-tone attribute and theme tokens.",
    },
    {
      name: "size",
      type: '"sm" | "md" | "lg"',
      default: '"md"',
      description: "Scales both the orb dimensions and the inner icon.",
    },
    {
      name: "loading",
      type: "boolean",
      default: "false",
      description: "Adds data-loading to animate the rings (pulse state).",
    },
    {
      name: "className",
      type: "string",
      description: "Extra classes merged onto the orb wrapper via cn.",
    },
  ],
  whenToUse: [
    "Hero glyph for empty states, status panels, and onboarding callouts.",
    "Signalling a semantic tone (success/warning/danger) at a glance alongside text.",
  ],
  whenNotToUse: [
    "Inline status next to text — use a Badge or Icon instead.",
    "Interactive triggers — the orb is aria-hidden and carries no button semantics.",
  ],
  notes: [
    "Rendered aria-hidden, so it is decorative only; convey meaning in accompanying text.",
    "All color and ring styling comes from the theme-status-orb-* CSS classes and the data-tone attribute.",
  ],
};
