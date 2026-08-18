import { AppearanceCog } from "@/app/_components/AppearanceCog";

import type { StoryDef } from "../registry/types";

export const appearanceCogStory: StoryDef = {
  id: "appearance-cog",
  name: "Appearance cog",
  tier: "layout",
  status: "stable",
  summary:
    "The reader's single appearance control: a 44px cog opening a two-row popover — the Fun/Pro and Day/Night pills with an editor-only Theme Lab link on one line, the accent swatches on the next. No control in it carries a visible label; each names itself for assistive technology instead. Mounted in the footer, the homepage floating cluster and this catalog's header.",
  source: "src/app/_components/AppearanceCog.tsx",
  importLine: 'import { AppearanceControls } from "@/app/_components/AppearanceControls";',
  // The symbol lives in src/app/_components, not in a shared ui/common/layout barrel, so the
  // completeness gate neither requires nor accepts it here. The entry exists for the four-way
  // appearance sweep and for the catalog itself.
  exports: [],
  examples: [
    {
      label: "Every row",
      note: "dose.wiki with an editor session: both axis pills plus the Theme Lab link on row one, the accent swatches under them.",
      background: "plain",
      render: () => (
        <AppearanceCog showVisualStyle showColorScheme showAccent showMoreSettings />
      ),
    },
    {
      label: "Reader",
      note: "The shipped public shape. 'More settings' points at an editor route, so a reader is not offered a control they cannot use.",
      background: "plain",
      render: () => (
        <AppearanceCog
          showVisualStyle
          showColorScheme
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
      name: "showAccent",
      type: "boolean",
      description:
        "Renders one swatch per entry in ACCENTS. AppearanceControls passes !isAccentLocked.",
    },
    {
      name: "showMoreSettings",
      type: "boolean",
      description:
        "Renders the /dev/themes link as a 44px icon button at the end of row one. AppearanceControls passes an editor-session check, so readers never see it.",
    },
  ],
  whenToUse: [
    "Any surface that offers a reader appearance choices — mount AppearanceControls, which resolves the rows from publication policy and the session.",
  ],
  whenNotToUse: [
    "Editor colour authoring — that is the Theme Lab at /dev/themes, which this links to.",
    "A single axis on its own. The cog exists so a surface carries one control instead of a row of pills.",
  ],
  notes: [
    "Mount AppearanceControls, not AppearanceCog: the row props are publication and role policy, not a caller decision.",
    "Every surface is an existing themed recipe — theme-overlay-surface, theme-toggle-pill, theme-control-pill-quiet — so Fun's frosted treatment and Pro's flat hairline one come from the same markup.",
    "The swatch row reads ACCENTS from src/theme/accents.ts. It states no count, label or colour of its own, so growing the accent set needs no change here: the row wraps, and at a coarse pointer it wraps at four 44px cells per line, so a seventh accent reads as 4+3 instead of overflowing a 320px viewport.",
    "Nothing inside the panel is text. The row labels were deleted because they could neither name nor be associated with controls that already carry action-shaped names, which is what buys the panel ~70px of height at the same width.",
    "Escape closes the panel and is stopped inside it, so it cannot also reach a page-level Escape handler above the portal. Closing returns focus to the cog.",
  ],
};
