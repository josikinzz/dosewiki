import { SectionHeader } from "@/components/common/SectionHeader";

import type { StoryDef } from "../registry/types";

export const sectionHeaderStory: StoryDef = {
  id: "section-header",
  name: "SectionHeader",
  tier: "common",
  status: "stable",
  summary:
    "Article section heading recipe: an icon badge, a bold title, and a trailing gradient divider that fills the remaining row width.",
  source: "src/components/common/SectionHeader.tsx",
  importLine: 'import { SectionHeader } from "@/components/common/SectionHeader";',
  exports: ["SectionHeader"],
  examples: [
    {
      label: "Default",
      note: "Icon + title + gradient divider filling the rest of the row.",
      background: "plain",
      full: true,
      render: () => <SectionHeader icon="lucide:beaker" title="Dosage" />,
    },
    {
      label: "Common section icons",
      note: "The recipe accepts any Iconify name (lucide:*, mdi:*, custom:*).",
      background: "plain",
      full: true,
      render: () => (
        <div className="flex w-full flex-col gap-6">
          <SectionHeader icon="lucide:clock" title="Duration" />
          <SectionHeader icon="lucide:sparkles" title="Subjective Effects" />
          <SectionHeader icon="lucide:triangle-alert" title="Harm Potential" />
        </div>
      ),
    },
    {
      label: "On a card surface",
      note: "Title color and divider track theme tokens, so it reads on any stage.",
      background: "card",
      full: true,
      render: () => <SectionHeader icon="lucide:book-open" title="History & Culture" />,
    },
    {
      label: "Long title",
      note: "Title is whitespace-nowrap; the divider shrinks to fit the remaining space.",
      background: "plain",
      full: true,
      render: () => (
        <SectionHeader icon="lucide:scale" title="Legal Status & Scheduling" />
      ),
    },
  ],
  props: [
    {
      name: "icon",
      type: "IconName (string)",
      description: 'Iconify icon name, e.g. "lucide:beaker", "mdi:home", or "custom:benzene".',
    },
    {
      name: "title",
      type: "string",
      description: "Section heading text rendered inside an <h2>.",
    },
    {
      name: "className",
      type: "string",
      description: "Extra classes merged onto the outer flex row via cn.",
    },
  ],
  whenToUse: [
    "Heading any article section for consistent icon + title + divider styling.",
    "Anywhere a tokenised, full-width section heading is needed across public pages.",
  ],
  whenNotToUse: [
    "Sub-headings inside a section — this is a top-level <h2> with a heavy divider.",
    "Standalone labels with no divider; use a plain heading or Badge instead.",
  ],
  notes: [
    "Renders a semantic <h2>; keep one per logical section for correct document outline.",
    "Title is whitespace-nowrap and the icon is fixed at h-8 w-8, so very long titles push the divider rather than wrapping.",
    "Heading color and divider use --theme-section-heading and --theme-horizontal-divider-image, so it adapts to every theme.",
  ],
};
