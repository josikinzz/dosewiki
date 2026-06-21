import { Icon } from "@/components/common/Icon";

import type { StoryDef } from "../registry/types";

export const iconStory: StoryDef = {
  id: "icon",
  name: "Icon",
  tier: "common",
  status: "stable",
  summary:
    "Single icon renderer over Iconify. Takes a prefixed name (lucide:, mdi:, custom:) and renders an aria-hidden, currentColor SVG.",
  source: "src/components/common/Icon.tsx",
  importLine: 'import { Icon } from "@/components/common/Icon";',
  exports: ["Icon"],
  examples: [
    {
      label: "Lucide icons",
      note: "Bundled Lucide set — reference any glyph as lucide:<name>.",
      render: () => (
        <div className="flex items-center gap-4 text-[var(--theme-text-primary)]">
          <Icon icon="lucide:search" />
          <Icon icon="lucide:flask-conical" />
          <Icon icon="lucide:triangle-alert" />
          <Icon icon="lucide:book-open" />
          <Icon icon="lucide:external-link" />
        </div>
      ),
    },
    {
      label: "Other Iconify collections",
      note: "Any installed Iconify prefix works, e.g. mdi:<name>.",
      render: () => (
        <div className="flex items-center gap-4 text-[var(--theme-text-primary)]">
          <Icon icon="mdi:home" />
          <Icon icon="mdi:pill" />
          <Icon icon="mdi:molecule" />
        </div>
      ),
    },
    {
      label: "Custom icons",
      note: "Project SVGs registered in customIcons, referenced as custom:<key>.",
      render: () => (
        <div className="flex items-center gap-4 text-[var(--theme-text-primary)]">
          <Icon icon="custom:benzene" />
          <Icon icon="custom:rectal" />
          <Icon icon="custom:elf" />
        </div>
      ),
    },
    {
      label: "Sizing",
      note: "size accepts a number (px) or any CSS length string.",
      render: () => (
        <div className="flex items-end gap-4 text-[var(--theme-text-primary)]">
          <Icon icon="lucide:flask-conical" size={16} />
          <Icon icon="lucide:flask-conical" size={24} />
          <Icon icon="lucide:flask-conical" size={40} />
          <Icon icon="lucide:flask-conical" size="3rem" />
        </div>
      ),
    },
    {
      label: "Inherits color via className",
      note: "Icons paint with currentColor — set text color on the icon or a parent.",
      background: "card",
      render: () => (
        <div className="flex items-center gap-4">
          <Icon icon="lucide:circle-check" className="text-[var(--theme-success-text)]" />
          <Icon icon="lucide:triangle-alert" className="text-[var(--theme-warning-text)]" />
          <Icon icon="lucide:octagon-x" className="text-[var(--theme-danger-text)]" />
          <Icon icon="lucide:info" className="text-[var(--theme-text-muted)]" />
        </div>
      ),
    },
    {
      label: "Inline with text",
      note: "Pairs cleanly with a label inside buttons, badges, and headings.",
      background: "card",
      render: () => (
        <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--theme-text-primary)]">
          <Icon icon="lucide:search" size={16} />
          Search substances
        </span>
      ),
    },
    {
      label: "Unknown custom key falls through",
      note: "A custom: name with no match renders the Iconify fallback rather than throwing.",
      render: () => (
        <div className="flex items-center gap-4 text-[var(--theme-text-muted)]">
          <Icon icon="custom:does-not-exist" />
        </div>
      ),
    },
  ],
  props: [
    {
      name: "icon",
      type: "string (IconName)",
      description:
        'Prefixed icon name, e.g. "lucide:search", "mdi:home", or "custom:benzene".',
    },
    {
      name: "size",
      type: "number | string",
      default: "24",
      description: "Width and height; a number is px, a string is any CSS length.",
    },
    {
      name: "className",
      type: "string",
      description: "Passed through to the SVG; use text color utilities to tint via currentColor.",
    },
  ],
  whenToUse: [
    "Any single inline icon — nav, buttons, badges, headings, metadata.",
    'Custom project glyphs registered in customIcons, referenced as "custom:<key>".',
  ],
  whenNotToUse: [
    "Decorative icons that need their own label — Icon is always aria-hidden.",
    "Large illustrative artwork or molecule renders — use a dedicated SVG asset.",
  ],
  notes: [
    'Always rendered aria-hidden="true"; add visible text or an aria-label on the interactive wrapper for meaning.',
    "Paints with currentColor, so color comes from the className or an ancestor text color.",
    'The Lucide collection is bundled; "custom:" keys come from src/components/common/customIcons; other prefixes resolve via Iconify if installed.',
  ],
};
