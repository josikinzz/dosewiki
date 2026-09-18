import { ExpandButton, ExpandIndicator } from "@/components/common/ExpandButton";

import type { StoryDef } from "../registry/types";

const noop = () => {};

export const expandButtonStory: StoryDef = {
  id: "expand-button",
  name: "ExpandButton",
  tier: "common",
  status: "stable",
  summary:
    "Toggle affordance for expand/collapse sections. Pairs an ellipsis + rotating chevron, with variants for floating, inline, count, chip, and card placements.",
  source: "src/components/common/ExpandButton.tsx",
  importLine: 'import { ExpandButton, ExpandIndicator } from "@/components/common/ExpandButton";',
  exports: ["ExpandButton", "ExpandIndicator"],
  intents: [
    { family: "expand", need: "A standalone or inline reveal control: hidden-list counts, section previews", policy: "#expand-affordance-policy" },
  ],
  examples: [
    {
      label: "Active variants",
      note: "floating, inline, chip, and card cover the supported placements.",
      render: () => (
        <>
          <ExpandButton isExpanded={false} onToggle={noop} variant="floating" label="More" />
          <ExpandButton isExpanded={false} onToggle={noop} variant="inline" label="Details" />
          <ExpandButton isExpanded={false} onToggle={noop} variant="chip" label="Show all" />
          <ExpandButton isExpanded={false} onToggle={noop} variant="card" label="Expand" />
        </>
      ),
    },
    {
      label: "Collapsed vs expanded",
      note: "The chevron rotates 180° when isExpanded is true.",
      render: () => (
        <>
          <ExpandButton isExpanded={false} onToggle={noop} variant="floating" label="Collapsed" />
          <ExpandButton isExpanded onToggle={noop} variant="floating" label="Expanded" />
        </>
      ),
    },
    {
      label: "Count variant",
      note: "Shows a label, a signed +/- count, and a standalone chevron.",
      render: () => (
        <>
          <ExpandButton
            isExpanded={false}
            onToggle={noop}
            variant="count"
            label="Effects"
            count={12}
          />
          <ExpandButton
            isExpanded
            onToggle={noop}
            variant="count"
            label="Effects"
            count={12}
          />
        </>
      ),
    },
    {
      label: "Icon-only (no label)",
      note: "Without a label the button renders just the ellipsis + chevron indicator.",
      background: "card",
      render: () => (
        <>
          <ExpandButton isExpanded={false} onToggle={noop} variant="floating" />
          <ExpandButton isExpanded onToggle={noop} variant="floating" />
        </>
      ),
    },
    {
      label: "ExpandIndicator (standalone)",
      note: "The bare indicator span for composing custom triggers; collapsed then expanded.",
      render: () => (
        <div className="flex items-center gap-4">
          <ExpandIndicator isExpanded={false} variant="inline" />
          <ExpandIndicator isExpanded variant="inline" />
          <ExpandIndicator isExpanded={false} variant="floating" />
          <ExpandIndicator isExpanded variant="card" />
        </div>
      ),
    },
  ],
  props: [
    { name: "isExpanded", type: "boolean", description: "Current expanded state; drives chevron rotation and aria-expanded." },
    { name: "onToggle", type: "() => void", description: "Called on click to flip the expanded state." },
    {
      name: "variant",
      type: '"floating" | "inline" | "count" | "chip" | "card" | "pill" | "compact" | "badge"',
      default: '"floating"',
      description: "Visual treatment. pill, compact, and badge are deprecated aliases of floating, inline, and chip.",
    },
    { name: "count", type: "number", description: "For the count variant — rendered as a signed +/- value." },
    { name: "label", type: "string", description: "Descriptive label shown instead of the ellipsis icon." },
    { name: "children", type: "ReactNode", description: "Custom content; for count it sits before the +/- value." },
    { name: "ariaLabel", type: "string", default: '"Expand/Collapse section"', description: "Accessible label override." },
    { name: "ariaControls", type: "string", description: "id of the region this button controls." },
    { name: "className", type: "string", description: "Extra classes merged via cn." },
  ],
  whenToUse: [
    "Show-more / collapse toggles on cards, badges, value rows, and section headers.",
    "Count-style expanders that surface how many extra items are hidden (count variant).",
  ],
  whenNotToUse: [
    "Primary page actions — use Button.",
    "Static non-interactive disclosure markers — use ExpandIndicator alone.",
  ],
  notes: [
    "ExpandButton renders a real <button> with aria-expanded; pass ariaControls to wire it to the region it toggles.",
    "ExpandIndicator is the non-interactive span (ellipsis + rotating chevron) used internally and reusable for custom triggers; it supports floating, inline, card, pill, and compact variants only.",
    "pill, compact, and badge variants are deprecated — prefer floating, inline, and chip respectively.",
  ],
};
