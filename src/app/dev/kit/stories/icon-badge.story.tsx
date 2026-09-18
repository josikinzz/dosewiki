import { IconBadge } from "@/components/common/IconBadge";

import type { StoryDef } from "../registry/types";

export const iconBadgeStory: StoryDef = {
  id: "icon-badge",
  name: "IconBadge",
  tier: "common",
  status: "stable",
  summary:
    "A small, tokenised status-orb chip that frames a single Icon. Use it for compact iconographic accents beside headings, list rows, and metadata.",
  source: "src/components/common/IconBadge.tsx",
  importLine: 'import { IconBadge } from "@/components/common/IconBadge";',
  exports: ["IconBadge"],
  examples: [
    {
      label: "Default (accent, md)",
      note: "Defaults: tone=\"accent\", size=\"md\". Renders the icon inside the orb core.",
      render: () => <IconBadge icon="lucide:sparkles" label="Sparkles" />,
    },
    {
      label: "Sizes",
      note: 'sm is 28px (16px icon), md is 32px (20px icon).',
      render: () => (
        <div className="flex items-center gap-3">
          <IconBadge icon="lucide:search" size="sm" label="Small" />
          <IconBadge icon="lucide:search" size="md" label="Medium" />
        </div>
      ),
    },
    {
      label: "Tones",
      note: "accent and neutral carry distinct token styling; success/warning/danger set data-tone for theme hooks.",
      render: () => (
        <div className="flex items-center gap-3">
          <IconBadge icon="lucide:flask-conical" tone="accent" label="Accent" />
          <IconBadge icon="lucide:flask-conical" tone="neutral" label="Neutral" />
          <IconBadge icon="lucide:check" tone="success" label="Success" />
          <IconBadge icon="lucide:triangle-alert" tone="warning" label="Warning" />
          <IconBadge icon="lucide:octagon-alert" tone="danger" label="Danger" />
        </div>
      ),
    },
    {
      label: "Numeric size",
      note: "Passing a number sets the inner icon size directly while the orb stays at the md shell.",
      render: () => (
        <div className="flex items-center gap-3">
          <IconBadge icon="lucide:zap" size={14} label="14px icon" />
          <IconBadge icon="lucide:zap" size={20} label="20px icon" />
          <IconBadge icon="lucide:zap" size={26} label="26px icon" />
        </div>
      ),
    },
    {
      label: "On a card surface",
      background: "card",
      note: "Pairs cleanly with a label beside it for section headers and list rows.",
      render: () => (
        <div className="flex items-center gap-2">
          <IconBadge icon="lucide:pill" tone="accent" label="Dosage" />
          <span className="text-sm font-medium text-[var(--theme-text-primary)]">Dosage</span>
        </div>
      ),
    },
  ],
  props: [
    { name: "icon", type: "IconName (string)", description: "Iconify icon id, e.g. \"lucide:search\" or \"custom:benzene\"." },
    {
      name: "label",
      type: "string",
      description: "Optional accessible label rendered as sr-only text. The icon itself is aria-hidden.",
    },
    {
      name: "tone",
      type: '"accent" | "neutral" | "success" | "warning" | "danger"',
      default: '"accent"',
      description: "Visual tone; also written to data-tone for theme styling hooks.",
    },
    {
      name: "size",
      type: '"sm" | "md" | number',
      default: '"md"',
      description: "Named size sets both shell and icon; a number sets just the icon size on the md shell.",
    },
    { name: "className", type: "string", description: "Extra classes merged onto the orb via cn." },
  ],
  whenToUse: [
    "Compact iconographic accents beside section headings, list rows, or metadata.",
    "Status-orb chips where the icon conveys meaning and an sr-only label provides the text.",
  ],
  whenNotToUse: [
    "Clickable actions — IconBadge renders a non-interactive <span>; use Button or an icon button.",
    "Standalone inline icons without a framed orb — use Icon directly.",
  ],
  notes: [
    "Renders a <span> with theme-status-orb classes, so it has no button semantics.",
    "The icon is aria-hidden; pass label for an accessible name.",
    "success/warning/danger currently apply no extra tone class but still set data-tone for downstream theming.",
    "A numeric size keeps the md shell and only changes the inner icon dimension.",
  ],
};
