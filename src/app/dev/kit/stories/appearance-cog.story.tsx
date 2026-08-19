import { AppearanceCog } from "@/app/_components/AppearanceCog";

import type { StoryDef } from "../registry/types";

export const appearanceCogStory: StoryDef = {
  id: "appearance-cog",
  name: "Appearance cog",
  tier: "layout",
  status: "stable",
  summary:
    "The reader's single appearance control: a 44px cog opens the Fun/Pro and Day/Night controls, scheme-aware Surface and Accent swatches, and an explicit full Palette Lab action. Pro keeps the Surface row visible but disabled because its materials are fixed.",
  source: "src/app/_components/AppearanceCog.tsx",
  importLine: 'import { AppearanceControls } from "@/app/_components/AppearanceControls";',
  // The symbol lives in src/app/_components, not in a shared ui/common/layout barrel, so the
  // completeness gate neither requires nor accepts it here. The entry exists for the four-way
  // appearance sweep and for the catalog itself.
  exports: [],
  examples: [
    {
      label: "DoseWiki",
      note: "The shipped DoseWiki panel: both binary controls, both palette rows, and the full Palette Lab action at the end.",
      background: "plain",
      render: () => (
        <AppearanceCog showVisualStyle showColorScheme showSurface showAccent showMoreSettings />
      ),
    },
    {
      label: "Without Palette Lab",
      note: "A publication or embedding surface without the public Palette Lab drawer.",
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
      note: "Effect Index: its identity is Pro and it ships no accent picker, so neither control is present — never present and inert. Day/night remains, alone on row one.",
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
        "Renders one scheme-aware swatch per shipped Surface. The row is disabled and marked Fun only while Pro is active.",
    },
    {
      name: "showAccent",
      type: "boolean",
      description:
        "Renders one swatch per entry in ACCENTS. AppearanceControls passes !isAccentLocked.",
    },
    {
      name: "showMoreSettings",
      type: "boolean",
      description:
        "Renders the explicit full-width action that opens the global Palette Lab drawer.",
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
    "Surface swatches preview the active light or dark material. Pro keeps its fixed restrained materials, so the Surface controls become disabled without discarding the stored selection.",
    "The swatch rows read SURFACES and ACCENTS from their registries and wrap to preserve 44px coarse-pointer targets.",
    "Escape closes the panel and is stopped inside it, so it cannot also reach a page-level Escape handler above the portal. Closing returns focus to the cog.",
  ],
};
