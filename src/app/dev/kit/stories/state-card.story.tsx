import { Button } from "@/components/ui/button";
import { StateCard } from "@/components/common/StateCard";

import type { StoryDef } from "../registry/types";

export const stateCardStory: StoryDef = {
  id: "state-card",
  name: "StateCard",
  tier: "common",
  status: "stable",
  summary:
    "Hero status panel with a status orb, optional badge, title, description, actions, and footer. Use for empty, error, loading, and 'under construction' full-bleed states.",
  source: "src/components/common/StateCard.tsx",
  importLine: 'import { StateCard } from "@/components/common/StateCard";',
  exports: ["StateCard"],
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
      note: "loading animates the orb and sets aria-busy / data-loading-state.",
      background: "plain",
      full: true,
      render: () => (
        <StateCard
          className="w-full"
          loading
          icon="lucide:loader-circle"
          title="Fetching the latest data"
          description="Hang tight while we pull this content from Convex."
        />
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
          footer="Drafts are saved to Convex and reviewed before publishing."
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
    { name: "description", type: "ReactNode", description: "Required supporting copy under the title." },
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
      description: "Iconify name shown inside the status orb.",
    },
    {
      name: "tone",
      type: '"accent" | "success" | "warning" | "danger" | "neutral"',
      default: '"accent"',
      description: "Drives orb colour; danger also tints the surface, neutral falls back to accent on the orb.",
    },
    { name: "loading", type: "boolean", default: "false", description: "Animates the orb and sets aria-busy." },
    { name: "actions", type: "ReactNode", description: "Optional button row; wraps and aligns to the layout." },
    { name: "footer", type: "ReactNode", description: "Optional faint helper line below the body." },
    {
      name: "align",
      type: '"center" | "left"',
      default: '"center"',
      description: "Center stacks the orb above the copy; left places it beside.",
    },
    { name: "compact", type: "boolean", default: "false", description: "Smaller orb and tighter corner radius." },
    { name: "className", type: "string", description: "Extra classes merged onto the outer surface." },
  ],
  whenToUse: [
    "Full-bleed empty, error, loading, or 'under construction' states.",
    "Section placeholders that prompt an editor action (generate, write, retry).",
  ],
  whenNotToUse: [
    "Inline or compact status — reach for StatusOrb or a Badge alone.",
    "Dense content cards — use ContentCard / NestedContentCard from the Surface recipes.",
  ],
  notes: [
    "Built on StatusState (Surface), StatusOrb, Badge, and Icon — purely presentational, no providers needed.",
    "tone='danger' is the only tone that changes the surface fill; all others only colour the orb.",
  ],
};
