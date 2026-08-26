import { AppearanceCog } from "@/app/_components/AppearanceCog";

import type { StoryDef } from "../registry/types";

export const appearanceCogStory: StoryDef = {
  id: "appearance-cog",
  name: "Appearance cog",
  tier: "layout",
  status: "stable",
  summary:
    "The reader's single appearance control: a 44px settings gear opens a narrow, permanently dark panel with named Style, Mode, and Font selectors; Background and Accent colour axes collapsed behind summary rows that expand to hue/saturation sliders; a scoped color reset; and an explicit Theme Lab action.",
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
      note: "The shipped DoseWiki panel: three labeled preference rows, both labeled color axes, a scoped color reset, and the Theme Lab action.",
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
      label: "Style and accent locked",
      note: "Effect Index: its identity and accent are locked, so only its available Darkness control remains — omitted axes are never rendered inert.",
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
        "Renders the labeled Style selector with stable Fun and Pro radio options. A locked axis is omitted rather than disabled.",
    },
    {
      name: "showColorScheme",
      type: "boolean",
      description:
        "Renders the labeled Darkness selector with stable Dark and Light options.",
    },
    {
      name: "showSurface",
      type: "boolean",
      description:
        "Renders the Surface hue and saturation sliders. Live on both visual styles: Pro's additive surface blocks tint the authored charcoal, whose own position is level 0.",
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
        "Renders the labeled Font selector: Standard / Dyslexic as named radio options, the latter set in an 8-glyph Lexend label subset so the preview costs nobody the full face.",
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
    "Each colour axis is a labelled (hue, saturation) pair over the authored palette, collapsed behind a summary row in the reader panel (the Theme Lab authoring surface keeps them open). Reset colors restores only Background and Accent defaults.",
    "Escape closes the panel and is stopped inside it, so it cannot also reach a page-level Escape handler above the portal. Closing returns focus to the cog.",
  ],
};
