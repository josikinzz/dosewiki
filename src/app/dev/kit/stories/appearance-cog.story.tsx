import { AppearanceCog } from "@/app/_components/AppearanceCog";

import type { StoryDef } from "../registry/types";

export const appearanceCogStory: StoryDef = {
  id: "appearance-cog",
  name: "Appearance cog",
  tier: "layout",
  status: "stable",
  summary:
    "The reader's single appearance control: a 44px settings gear opens a narrow, permanently dark panel on the Colour tab. Background and Accent use ellipsis-and-chevron disclosures on mobile and stay expanded on desktop. One bare icon swaps to the Font tab with its face picker, reading-type sliders, and reset.",
  source: "src/app/_components/AppearanceCog.tsx",
  importLine:
    'import { AppearanceControls } from "@/app/_components/AppearanceControls";',
  // The symbol lives in src/app/_components, not in a shared ui/common/layout barrel, so the
  // completeness gate neither requires nor accepts it here. The entry exists for the four-way
  // appearance sweep and for the catalog itself.
  exports: [],
  examples: [
    {
      label: "DoseWiki",
      note: "The shipped DoseWiki panel: colour controls first, mobile-only Background and Accent disclosures, a scoped color reset, and the Theme Lab action.",
      background: "plain",
      render: () => (
        <AppearanceCog
          showVisualStyle
          showColorScheme
          showSurface
          showAccent
          showFont
          showMoreSettings
        />
      ),
    },
    {
      label: "Without Theme Lab",
      note: "A publication or embedding surface without the public Theme Lab drawer.",
      background: "plain",
      render: () => (
        <AppearanceCog
          showVisualStyle
          showColorScheme
          showSurface
          showAccent
          showFont
          showMoreSettings={false}
        />
      ),
    },
    {
      label: "Accent and type locked",
      note: "Effect Index: its identity and accent are locked and it offers no font axis, so only its Darkness control remains — omitted axes are never rendered inert, and the panel never offers tab navigation for a tab it does not have.",
      background: "plain",
      render: () => (
        <AppearanceCog
          showVisualStyle={false}
          showColorScheme
          showSurface={false}
          showAccent={false}
          showFont={false}
          showMoreSettings={false}
        />
      ),
    },
  ],
  props: [
    {
      name: "className",
      type: "string",
      description:
        "Lands on the trigger button, with no wrapper in between, so a caller positioning the control directly can do so without an intermediate box taking the offset.",
    },
    {
      name: "showVisualStyle",
      type: "boolean",
      description:
        "Renders the labeled Style picker with stable Vivid and Clinical options on the colour tab's first row.",
    },
    {
      name: "showColorScheme",
      type: "boolean",
      description:
        "Renders the labeled Darkness selector with stable Dark and Light options on the colour tab.",
    },
    {
      name: "showSurface",
      type: "boolean",
      description:
        "Renders the Surface hue and saturation sliders, always open on the colour tab. Live on both visual styles: Pro's additive surface blocks tint the authored charcoal, whose own position is level 0.",
    },
    {
      name: "showAccent",
      type: "boolean",
      description:
        "Renders the Accent hue and saturation sliders. AppearanceControls passes !isAccentLocked.",
    },
    {
      name: "showFont",
      type: "boolean",
      description:
        "Renders the font tab: the five-face picker (Lexend by default), the four reading-type sliders, and their reset.",
    },
    {
      name: "showMoreSettings",
      type: "boolean",
      description:
        "Renders the explicit full-width action that opens the global Theme Lab drawer.",
    },
  ],
  whenToUse: [
    "Any surface that offers appearance choices — mount AppearanceControls, which resolves the rows from publication policy.",
  ],
  whenNotToUse: [
    "Editor-only workbench context — that remains on the protected /dev/themes route.",
    "A single axis on its own. The cog exists so a surface carries one control instead of a row of pills.",
  ],
  notes: [
    "Mount AppearanceControls, not AppearanceCog: the row props are publication policy, not a caller decision.",
    "The panel uses the sticky header's dark chrome palette in both page schemes and a drop shadow, never a modal backdrop.",
    "Two tabs, font first: the face picker and the reading-type sliders, then the colour rails. One bare icon swaps between them — paintbrush on the font tab, type glyph on the colour tab — with no card of its own. The Fun/Pro style axis and the System scheme option remain authoring/Theme Lab surfaces, not reader rows.",
    "Each colour axis is a labelled (hue, saturation) pair over the authored palette, always open inside its tab. Reset to defaults is the font tab's permanent fixture; Reset colors appears only while a colour axis carries a saved coordinate. Each restores only its own tab's axes.",
    "Escape closes the panel and is stopped inside it, so it cannot also reach a page-level Escape handler above the portal. Closing returns focus to the cog.",
  ],
};
