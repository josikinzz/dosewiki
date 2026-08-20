import { AppearanceCog } from "@/app/_components/AppearanceCog";

import type { StoryDef } from "../registry/types";

export const appearanceCogStory: StoryDef = {
  id: "appearance-cog",
  name: "Appearance cog",
  tier: "layout",
  status: "stable",
  summary:
    "The reader's single appearance control: a 44px cog opens the Fun/Pro and Day/Night controls, Surface and Accent hue/saturation sliders, and an explicit Theme Lab action. Pro keeps the Surface rows visible but disabled because its materials are fixed.",
  source: "src/app/_components/AppearanceCog.tsx",
  importLine: 'import { AppearanceControls } from "@/app/_components/AppearanceControls";',
  // The symbol lives in src/app/_components, not in a shared ui/common/layout barrel, so the
  // completeness gate neither requires nor accepts it here. The entry exists for the four-way
  // appearance sweep and for the catalog itself.
  exports: [],
  examples: [
    {
      label: "DoseWiki",
      note: "The shipped DoseWiki panel: both binary controls, both slider rows, and the Theme Lab action at the end.",
      background: "plain",
      render: () => (
        <AppearanceCog showVisualStyle showColorScheme showSurface showAccent showMoreSettings />
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
          showMoreSettings={false}
        />
      ),
    },
    {
      label: "Style and accent locked",
      note: "Effect Index: its identity is Pro and it ships no colour sliders, so neither control is present — never present and inert. Day/night remains, alone on row one.",
      background: "plain",
      render: () => (
        <AppearanceCog
          showVisualStyle={false}
          showColorScheme
          showSurface={false}
          showAccent={false}
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
        "Lands on the trigger button, with no wrapper in between. The homepage passes its fixed-position class here because search-mode CSS repositions that class.",
    },
    {
      name: "showVisualStyle",
      type: "boolean",
      description:
        "Renders the Fun/Pro pill. AppearanceControls passes !isVisualStyleLocked — a locked axis has no writable setter, so the control is omitted rather than disabled.",
    },
    {
      name: "showColorScheme",
      type: "boolean",
      description: "Renders the Day/Night pill. Follows SITE_FLAVOR_CONFIG.showColorSchemeToggle.",
    },
    {
      name: "showSurface",
      type: "boolean",
      description:
        "Renders the Surface hue and saturation sliders. The rows are disabled and marked Fun only while Pro is active.",
    },
    {
      name: "showAccent",
      type: "boolean",
      description:
        "Renders the Accent hue and saturation sliders. AppearanceControls passes !isAccentLocked.",
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
    "The Surface sliders preview the effective material. Pro keeps its fixed restrained materials, so the Surface controls become disabled without discarding the stored levels.",
    "Every colour choice is a (hue, saturation) pair over the one authored palette; there are no swatch registries left to enumerate.",
    "Escape closes the panel and is stopped inside it, so it cannot also reach a page-level Escape handler above the portal. Closing returns focus to the cog.",
  ],
};
