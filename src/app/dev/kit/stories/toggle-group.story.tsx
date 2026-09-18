import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Underline } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import type { StoryDef } from "../registry/types";

export const toggleGroupStory: StoryDef = {
  id: "toggle-group",
  name: "ToggleGroup",
  tier: "primitive",
  status: "stable",
  summary:
    "A set of two-state toggle buttons that behave as one control — single-select for mutually exclusive choices, multiple-select for independent on/off flags.",
  source: "src/components/ui/toggle-group.tsx",
  importLine: 'import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";',
  exports: ["ToggleGroup", "ToggleGroupItem"],
  examples: [
    {
      label: "Single select",
      note: "type=\"single\" — one item active at a time (alignment, view mode, etc.).",
      render: () => (
        <ToggleGroup type="single" defaultValue="center" aria-label="Text alignment">
          <ToggleGroupItem value="left" aria-label="Align left">
            <AlignLeft />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Align center">
            <AlignCenter />
          </ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label="Align right">
            <AlignRight />
          </ToggleGroupItem>
        </ToggleGroup>
      ),
    },
    {
      label: "Multiple select",
      note: "type=\"multiple\" — independent flags, several can be on at once.",
      render: () => (
        <ToggleGroup type="multiple" defaultValue={["bold"]} aria-label="Text formatting">
          <ToggleGroupItem value="bold" aria-label="Bold">
            <Bold />
          </ToggleGroupItem>
          <ToggleGroupItem value="italic" aria-label="Italic">
            <Italic />
          </ToggleGroupItem>
          <ToggleGroupItem value="underline" aria-label="Underline">
            <Underline />
          </ToggleGroupItem>
        </ToggleGroup>
      ),
    },
    {
      label: "With labels",
      note: "Items can hold text instead of icons.",
      render: () => (
        <ToggleGroup type="single" defaultValue="list" aria-label="View mode">
          <ToggleGroupItem value="list">List</ToggleGroupItem>
          <ToggleGroupItem value="grid">Grid</ToggleGroupItem>
          <ToggleGroupItem value="table">Table</ToggleGroupItem>
        </ToggleGroup>
      ),
    },
    {
      label: "Variants",
      note: "Variant set on the group cascades to every item via context.",
      full: true,
      render: () => (
        <div className="flex flex-col gap-3">
          {(["default", "outline", "pill"] as const).map((variant) => (
            <div key={variant} className="flex items-center gap-3">
              <span className="w-16 text-xs text-[var(--theme-text-muted)]">{variant}</span>
              <ToggleGroup type="single" variant={variant} defaultValue="b" aria-label={`${variant} group`}>
                <ToggleGroupItem value="a">One</ToggleGroupItem>
                <ToggleGroupItem value="b">Two</ToggleGroupItem>
                <ToggleGroupItem value="c">Three</ToggleGroupItem>
              </ToggleGroup>
            </div>
          ))}
        </div>
      ),
    },
    {
      label: "Sizes",
      note: "size also cascades from the group.",
      full: true,
      render: () => (
        <div className="flex flex-col gap-3">
          {(["sm", "default", "lg"] as const).map((size) => (
            <div key={size} className="flex items-center gap-3">
              <span className="w-16 text-xs text-[var(--theme-text-muted)]">{size}</span>
              <ToggleGroup type="single" size={size} defaultValue="b" aria-label={`${size} group`}>
                <ToggleGroupItem value="a">One</ToggleGroupItem>
                <ToggleGroupItem value="b">Two</ToggleGroupItem>
                <ToggleGroupItem value="c">Three</ToggleGroupItem>
              </ToggleGroup>
            </div>
          ))}
        </div>
      ),
    },
    {
      label: "Disabled",
      note: "Disable the whole group or individual items.",
      render: () => (
        <ToggleGroup type="single" defaultValue="left" disabled aria-label="Disabled alignment">
          <ToggleGroupItem value="left" aria-label="Align left">
            <AlignLeft />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Align center">
            <AlignCenter />
          </ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label="Align right">
            <AlignRight />
          </ToggleGroupItem>
        </ToggleGroup>
      ),
    },
  ],
  props: [
    {
      name: "type",
      type: '"single" | "multiple"',
      description: "Required. Single keeps one item active; multiple allows independent on/off items.",
    },
    {
      name: "variant",
      type: '"default" | "outline" | "pill"',
      default: '"default"',
      description: "Visual treatment set on the group; cascades to every ToggleGroupItem via context.",
    },
    {
      name: "size",
      type: '"sm" | "default" | "lg" | "pill"',
      default: '"default"',
      description: "Item height/padding scale; cascades from the group.",
    },
    {
      name: "value / defaultValue",
      type: "string | string[]",
      description: "Controlled / uncontrolled active value(s). String for single, array for multiple.",
    },
    {
      name: "onValueChange",
      type: "(value) => void",
      description: "Fires when the active selection changes.",
    },
    {
      name: "disabled",
      type: "boolean",
      default: "false",
      description: "Disables the whole group (individual items also accept disabled).",
    },
  ],
  whenToUse: [
    "A small, fixed set of mutually exclusive options shown inline (alignment, view mode, density).",
    "A row of independent on/off formatting flags (bold/italic/underline) with type=\"multiple\".",
  ],
  whenNotToUse: [
    "A single standalone on/off control — use Toggle instead.",
    "Many options or options that should collapse on mobile — use Select or Tabs.",
    "Navigation between page sections — use Tabs.",
  ],
  notes: [
    "Built on @radix-ui/react-toggle-group; shares toggleVariants with the Toggle primitive.",
    "Set variant/size on the group, not per item — the group provides them through context.",
    "Always give the group an aria-label and each item an accessible label (text or aria-label) for icon-only items.",
  ],
};
