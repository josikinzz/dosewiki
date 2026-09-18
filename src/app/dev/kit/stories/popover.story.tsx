import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import type { StoryDef } from "../registry/types";

export const popoverStory: StoryDef = {
  id: "popover",
  name: "Popover",
  tier: "primitive",
  status: "stable",
  summary:
    "A Radix popover with the themed overlay surface preset — a floating panel anchored to a trigger for menus, filters, or small forms.",
  source: "src/components/ui/popover.tsx",
  importLine:
    'import { Popover, PopoverArrow, PopoverTrigger, PopoverContent } from "@/components/ui/popover";',
  exports: ["Popover", "PopoverArrow", "PopoverTrigger", "PopoverContent"],
  examples: [
    {
      label: "Basic popover",
      note: "Trigger plus content. Wrap a Button with asChild for a real button trigger.",
      background: "plain",
      render: () => (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">Open popover</Button>
          </PopoverTrigger>
          <PopoverContent>
            <PopoverArrow aria-hidden="true" className="theme-popover-arrow" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-[var(--theme-text-primary)]">
                Anchored panel
              </span>
              <span className="text-xs text-[var(--theme-text-muted)]">
                Renders into a portal on the themed overlay surface.
              </span>
            </div>
          </PopoverContent>
        </Popover>
      ),
    },
    {
      label: "Icon trigger",
      note: "Any element can be the trigger via asChild.",
      background: "plain",
      render: () => (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="iconGhost" size="icon" aria-label="Settings">
              <Settings2 />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start">
            <span className="text-sm text-[var(--theme-text-secondary)]">
              Compact settings panel.
            </span>
          </PopoverContent>
        </Popover>
      ),
    },
    {
      label: "Small form",
      note: "Popovers are good for short, focused edits.",
      background: "plain",
      render: () => (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="secondary">Edit label</Button>
          </PopoverTrigger>
          <PopoverContent>
            <form className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs text-[var(--theme-text-muted)]">
                Display name
                <input
                  defaultValue="2C-B"
                  className="rounded-md border border-[var(--theme-border-subtle)] bg-[var(--theme-surface-subtle)] px-2 py-1 text-sm text-[var(--theme-text-primary)] outline-none"
                />
              </label>
              <Button type="button" variant="accent" size="sm">
                Save
              </Button>
            </form>
          </PopoverContent>
        </Popover>
      ),
    },
    {
      label: "Alignment",
      note: "align controls the edge the content lines up with relative to the trigger.",
      background: "plain",
      full: true,
      render: () => (
        <div className="flex flex-wrap gap-3">
          {(["start", "center", "end"] as const).map((align) => (
            <Popover key={align}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  align={align}
                </Button>
              </PopoverTrigger>
              <PopoverContent align={align} className="w-56">
                <span className="text-xs text-[var(--theme-text-secondary)]">
                  Aligned to {align}.
                </span>
              </PopoverContent>
            </Popover>
          ))}
        </div>
      ),
    },
  ],
  props: [
    {
      name: "align",
      type: '"start" | "center" | "end"',
      default: '"center"',
      description: "PopoverContent edge alignment relative to the trigger.",
    },
    {
      name: "sideOffset",
      type: "number",
      default: "4",
      description: "PopoverContent gap (px) between the trigger and the panel.",
    },
    {
      name: "side",
      type: '"top" | "right" | "bottom" | "left"',
      default: '"bottom"',
      description: "Preferred side of the trigger to render on (Radix prop).",
    },
    {
      name: "asChild (PopoverTrigger)",
      type: "boolean",
      default: "false",
      description: "Render the trigger as its child element (e.g. a Button) instead of a bare button.",
    },
  ],
  whenToUse: [
    "Anchored, dismissable panels: quick filters, small forms, or contextual settings.",
    "Lightweight floating content that should close on outside click or Escape.",
  ],
  whenNotToUse: [
    "A list of commands or actions to pick from — use DropdownMenu.",
    "Blocking, focus-trapping flows or large content — use Dialog.",
    "Passive hover hints — use a tooltip.",
  ],
  notes: [
    "PopoverContent renders in a portal and presets the themed overlay surface (rounded, bordered, shadowed) plus open/close animations.",
  ],
};
