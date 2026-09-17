import { Button } from "@/components/ui/button";
import { StateCard } from "@/components/common/StateCard";

import type { StoryDef } from "../registry/types";

export const stateCardStory: StoryDef = {
  id: "state-card",
  name: "StateCard",
  tier: "common",
  status: "stable",
  summary:
    "Free-floating status stack: optional badge, a small tone-coloured glyph (or the indeterminate sweep while loading), title, description, actions, and footer. Use for empty, error, loading, and 'under construction' states without a panel around them.",
  source: "src/components/common/StateCard.tsx",
  importLine: 'import { StateCard } from "@/components/common/StateCard";',
  exports: ["StateCard"],
  intents: [
    { family: "surfaces", need: "An empty, loading, or error state inside a page region" },
  ],
  examples: [
    {
      label: "Default (centered, accent)",
      note: "Badge + title + description with the default sparkles orb.",
      background: "plain",
      full: true,
      render: () => (
        <StateCard
          className="w-full"
          badge="Coming soon"
          title="This section is under construction"
          description="We're still writing this part of the article. Check back shortly for the full breakdown."
        />
      ),
    },
    {
      label: "Tones",
      note: "tone drives the orb colour and danger surface; accent, success, warning, danger, neutral.",
      background: "plain",
      full: true,
      render: () => (
        <div className="grid w-full gap-4 lg:grid-cols-2">
          <StateCard
            className="w-full"
            tone="success"
            icon="lucide:check"
            badge="Verified"
            title="All citations resolved"
            description="Every claim in this article is backed by a reviewed source."
          />
          <StateCard
            className="w-full"
            tone="warning"
            icon="lucide:triangle-alert"
            badge="Heads up"
            title="Some data is incomplete"
            description="Dosage and duration figures are still being confirmed for this substance."
          />
          <StateCard
            className="w-full"
            tone="danger"
            icon="lucide:octagon-x"
            badge="Error"
            title="Couldn't load this article"
            description="Something went wrong fetching the content. The danger tone also tints the surface."
          />
          <StateCard
            className="w-full"
            tone="neutral"
            icon="lucide:inbox"
            badge="Nothing here"
            title="No results found"
            description="Try widening your filters — neutral tone keeps the orb on the accent colour."
          />
        </div>
      ),
    },
    {
      label: "Loading",
      note: "loading swaps the glyph for the theme-tokened sweep bar and sets role=status / aria-busy. Description is optional; a title alone is enough.",
      background: "plain",
      full: true,
      render: () => (
        <StateCard className="w-full" loading title="Loading playlists" />
      ),
    },
    {
      label: "With actions and footer",
      note: "actions render as a wrapped button row; footer is faint secondary text.",
      background: "plain",
      full: true,
      render: () => (
        <StateCard
          className="w-full"
          icon="lucide:flask-conical"
          badge="Editor only"
          title="Generate this section"
          description="No content exists yet. Run section generation to draft it, or write it by hand."
          actions={
            <>
              <Button>Generate draft</Button>
              <Button variant="outline">Write manually</Button>
            </>
          }
          footer="Drafts are saved to Postgres and reviewed before publishing."
        />
      ),
    },
    {
      label: "Left aligned + compact",
      note: "align='left' stacks the orb beside the copy; compact tightens the orb and radius.",
      background: "plain",
      full: true,
      render: () => (
        <StateCard
          className="w-full"
          align="left"
          compact
          tone="warning"
          icon="lucide:wrench"
          badge="Maintenance"
          title="Scheduled downtime"
          description="The editor will be briefly unavailable while we run a migration."
        />
      ),
    },
  ],
  props: [
    { name: "title", type: "ReactNode", description: "Required headline rendered as an h2." },
    { name: "description", type: "ReactNode", description: "Optional supporting copy under the title." },
    { name: "badge", type: "string", description: "Optional pill above the title; omitted when absent." },
    {
      name: "badgeVariant",
      type: 'BadgeProps["variant"]',
      default: '"secondary"',
      description: "Tone of the optional badge pill.",
    },
    {
      name: "icon",
      type: "IconName",
      default: '"lucide:sparkles"',
      description: "Iconify name for the small glyph above (or beside) the title. Hidden while loading.",
    },
    {
      name: "tone",
      type: '"accent" | "success" | "warning" | "danger" | "neutral"',
      default: '"accent"',
      description: "Colour of the glyph. Nothing else changes: there is no surface to tint.",
    },
    { name: "loading", type: "boolean", default: "false", description: "Shows the sweep bar instead of the glyph and sets role=status / aria-busy." },
    { name: "actions", type: "ReactNode", description: "Optional button row; wraps and aligns to the layout." },
    { name: "footer", type: "ReactNode", description: "Optional faint helper line below the body." },
    {
      name: "align",
      type: '"center" | "left"',
      default: '"center"',
      description: "Center stacks and centres the text; left aligns everything to the start edge.",
    },
    { name: "compact", type: "boolean", default: "false", description: "Smaller glyph, type, and vertical padding." },
    { name: "className", type: "string", description: "Extra classes merged onto the outer stack." },
  ],
  whenToUse: [
    "Full-bleed empty, error, loading, or 'under construction' states.",
    "Section placeholders that prompt an editor action (generate, write, retry).",
  ],
  whenNotToUse: [
    "Inline or compact status: a Badge or EditorStatusPill alone.",
    "Dense content cards — use ContentCard / NestedContentCard from the Surface recipes.",
  ],
  notes: [
    "Built on Badge and Icon plus the theme-loading-track / theme-loading-bar utilities; purely presentational, no providers needed.",
    "It draws no panel. Place it with spacing (mt-10, py) at the call site; never wrap it in a card.",
  ],
};
