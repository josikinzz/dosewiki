import { PageHeader } from "@/components/layout/PageHeader";

import type { StoryDef } from "../registry/types";

export const pageHeaderStory: StoryDef = {
  id: "page-header",
  name: "PageHeader",
  tier: "layout",
  status: "stable",
  summary:
    "Centered public page header: balanced title with an optional accent icon and optional lead description.",
  source: "src/components/layout/PageHeader.tsx",
  importLine: 'import { PageHeader } from "@/components/layout/PageHeader";',
  exports: ["PageHeader"],
  examples: [
    {
      label: "Title + description",
      note: "The default shape: balanced title with a lead description below.",
      background: "subtle",
      full: true,
      render: () => (
        <PageHeader
          className="mb-0"
          title="Effects Index"
          description="Browse subjective effects reported across psychoactive substances."
        />
      ),
    },
    {
      label: "With an accent icon",
      note: "Pass an Iconify name to prefix the title with a tinted icon.",
      background: "subtle",
      full: true,
      render: () => (
        <PageHeader
          className="mb-0"
          icon="lucide:sparkles"
          title="Trip Reports"
          description="First-person accounts, indexed by substance and dose."
        />
      ),
    },
    {
      label: "Title only",
      note: "Description is optional — omit it for a bare heading.",
      background: "subtle",
      full: true,
      render: () => (
        <PageHeader
          className="mb-0"
          icon="lucide:flask-conical"
          title="Substances"
        />
      ),
    },
    {
      label: "Left aligned",
      note: 'align="left" for pages that read as articles — a contents rail or left-aligned prose below gives the title an edge to share.',
      background: "subtle",
      full: true,
      render: () => (
        <PageHeader
          className="mb-0"
          icon="lucide:sparkles"
          title="Psychedelic"
          align="left"
          description="Substances that reliably induce states of altered perception, thought, and mood."
        />
      ),
    },
    {
      label: "Rich description node",
      note: "description accepts any ReactNode, so inline emphasis and links compose freely.",
      background: "subtle",
      full: true,
      render: () => (
        <PageHeader
          className="mb-0"
          icon="lucide:shield-alert"
          title="Safety First"
          description={
            <>
              Always <strong>test your substances</strong> and start with a low
              dose.
            </>
          }
        />
      ),
    },
  ],
  props: [
    {
      name: "title",
      type: "string",
      description: "Required heading text, rendered as the page <h1>.",
    },
    {
      name: "description",
      type: "ReactNode",
      description:
        "Optional lead copy under the title; accepts arbitrary JSX, not just a string.",
    },
    {
      name: "icon",
      type: "IconName (string)",
      description:
        'Optional Iconify/custom icon name (e.g. "lucide:sparkles"). Hung off the left edge of the title text at low accent opacity, out of flow, so the title centres on its letters alone.',
    },
    {
      name: "descriptionClassName",
      type: "string",
      description:
        "Overrides the default lead/typography classes applied to the description wrapper.",
    },
    {
      name: "className",
      type: "string",
      description: "Extra classes merged onto the <header> via cn.",
    },
  ],
  whenToUse: [
    "The top-of-page hero for public index and content routes (effects, reports, substances).",
    "Any centered page heading that wants a balanced title, optional accent icon, and lead description.",
  ],
  whenNotToUse: [
    "Section or card headings inside a page — this owns the page <h1> and large display type.",
    "Editor/dev chrome — those surfaces use their own dev-owned header primitives.",
  ],
  notes: [
    "Renders a semantic <header> containing the page <h1>; use one per route.",
    "Ships mb-16 by default — override via className when you need tighter spacing.",
    "The icon is decorative (aria-hidden) and uses accent-heading theme tokens.",
  ],
};
