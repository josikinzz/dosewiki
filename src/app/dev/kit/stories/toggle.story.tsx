import { Bold, Italic, Underline } from "lucide-react";

import { Toggle } from "@/components/ui/toggle";

import type { StoryDef } from "../registry/types";

export const toggleStory: StoryDef = {
  id: "toggle",
  name: "Toggle",
  tier: "primitive",
  status: "stable",
  summary:
    "A two-state on/off button built on Radix Toggle — pressing it flips a single boolean and reflects the state visually via data-[state=on].",
  source: "src/components/ui/toggle.tsx",
  importLine: 'import { Toggle } from "@/components/ui/toggle";',
  exports: ["Toggle", "toggleVariants"],
  examples: [
    {
      label: "Default",
      note: "Set defaultPressed for an uncontrolled initial state.",
      render: () => (
        <>
          <Toggle defaultPressed aria-label="Toggle bold">
            <Bold />
          </Toggle>
          <Toggle aria-label="Toggle italic">
            <Italic />
          </Toggle>
        </>
      ),
    },
    {
      label: "Variants",
      render: () => (
        <>
          <Toggle variant="default" defaultPressed>
            Default
          </Toggle>
          <Toggle variant="outline" defaultPressed>
            Outline
          </Toggle>
          <Toggle variant="pill" size="pill" defaultPressed>
            Pill
          </Toggle>
        </>
      ),
    },
    {
      label: "Sizes",
      render: () => (
        <>
          <Toggle size="sm" aria-label="Small">
            <Bold />
          </Toggle>
          <Toggle size="default" aria-label="Default">
            <Bold />
          </Toggle>
          <Toggle size="lg" aria-label="Large">
            <Bold />
          </Toggle>
        </>
      ),
    },
    {
      label: "With label and icon",
      render: () => (
        <Toggle defaultPressed>
          <Underline />
          Underline
        </Toggle>
      ),
    },
    {
      label: "Disabled",
      note: "Pointer events are blocked and opacity is reduced.",
      render: () => (
        <>
          <Toggle disabled aria-label="Disabled off">
            <Bold />
          </Toggle>
          <Toggle disabled defaultPressed aria-label="Disabled on">
            <Bold />
          </Toggle>
        </>
      ),
    },
  ],
  props: [
    {
      name: "variant",
      type: '"default" | "outline" | "pill"',
      default: '"default"',
      description: "Visual treatment. Pill pairs naturally with size=\"pill\".",
    },
    {
      name: "size",
      type: '"default" | "sm" | "lg" | "pill"',
      default: '"default"',
      description: "Height/padding scale and minimum hit target.",
    },
    {
      name: "pressed",
      type: "boolean",
      description: "Controlled on/off state. Pair with onPressedChange.",
    },
    {
      name: "defaultPressed",
      type: "boolean",
      default: "false",
      description: "Initial state when used uncontrolled.",
    },
    {
      name: "onPressedChange",
      type: "(pressed: boolean) => void",
      description: "Fired when the user toggles the control.",
    },
    {
      name: "disabled",
      type: "boolean",
      default: "false",
      description: "Blocks interaction and dims the control.",
    },
  ],
  whenToUse: [
    "A single binary on/off control, e.g. a formatting button or a view filter.",
    "Icon-only affordances that need a clear pressed state — pass an aria-label.",
  ],
  whenNotToUse: [
    "Mutually-exclusive choices in a row — reach for a toggle group / segmented control instead.",
    "A form field labelled on/off in settings — use Switch.",
    "A clickable action that does not retain a pressed state — use Button.",
  ],
  notes: [
    "Always provide an aria-label for icon-only toggles so the state is announced.",
  ],
};
