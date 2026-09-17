import { Badge } from "@/components/ui/badge";

import type { StoryDef } from "../registry/types";

export const badgeStory: StoryDef = {
  id: "badge",
  name: "Badge",
  tier: "primitive",
  status: "stable",
  summary:
    "Small static label primitive for status, severity, and metadata tags — pill-shaped, uppercase, theme-driven tones.",
  source: "src/components/ui/badge.tsx",
  importLine: 'import { Badge } from "@/components/ui/badge";',
  exports: ["Badge", "badgeVariants"],
  intents: [
    { family: "badges", need: "Status, severity, or a count on a control or data row", policy: "#name-chip-policy" },
  ],
  examples: [
    {
      label: "Tones",
      note: "Default, secondary, and outline cover most metadata and tag use.",
      render: () => (
        <>
          <Badge variant="default">Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
        </>
      ),
    },
    {
      label: "Status tones",
      note: "Use these to signal severity or success — not as buttons.",
      render: () => (
        <>
          <Badge variant="success">Verified</Badge>
          <Badge variant="destructive">High risk</Badge>
        </>
      ),
    },
    {
      label: "Interactive",
      note: "Hover affordance for badges that act as filters/toggles. Wrap in a real control for keyboard support.",
      render: () => (
        <>
          <Badge variant="interactive">Filter</Badge>
        </>
      ),
    },
    {
      label: "Effect pills",
      note: "Lower-contrast frosted pills used for effect/tag chips. effectInteractive adds hover + focus.",
      background: "card",
      render: () => (
        <>
          <Badge variant="effect">Euphoria</Badge>
          <Badge variant="effectInteractive">Stimulation</Badge>
          <Badge variant="ghostPill">Stealth</Badge>
        </>
      ),
    },
    {
      label: "Inside phrasing content (asChild)",
      note: "Render as the child element when a div would be invalid — inside a label, caption, or button row.",
      render: () => (
        <span>
          Accent{" "}
          <Badge asChild variant="outline" className="tracking-normal normal-case">
            <span>dark only</span>
          </Badge>
        </span>
      ),
    },
    {
      label: "Custom content",
      note: "Badges accept any children — combine with inline icons or counts.",
      render: () => (
        <>
          <Badge variant="secondary">12 reports</Badge>
          <Badge variant="default" className="tracking-normal normal-case">
            v2
          </Badge>
        </>
      ),
    },
  ],
  props: [
    {
      name: "variant",
      type: "see badgeVariants",
      default: '"default"',
      description:
        "Visual tone: default | secondary | destructive | outline | success | interactive | effect | effectInteractive | ghostPill.",
    },
    {
      name: "asChild",
      type: "boolean",
      default: "false",
      description:
        "Render as the single child element instead of a div, for badges inside phrasing content.",
    },
    {
      name: "className",
      type: "string",
      description: "Extra classes merged via cn — use --theme-* utilities only for any overrides.",
    },
  ],
  whenToUse: [
    "Status, severity, or verification labels (e.g. risk level, verified source).",
    "Compact metadata tags and effect chips beside content.",
  ],
  whenNotToUse: [
    "Clickable actions — use Button (interactive/effectInteractive are styling only, wrap a real control for a11y).",
    "Long-form text or anything needing wrapping — badges are single-line pills.",
  ],
  notes: [
    "Renders a plain <div>, so it carries no button semantics; the interactive variants only add hover/focus styling.",
  ],
};
