import {
  ContentCard,
  DangerCallout,
  EmptyStateSurface,
  InteractiveContentCard,
  InteractiveSurface,
  NestedContentCard,
  StatusState,
  Surface,
} from "@/components/ui/surface";

import type { StoryDef } from "../registry/types";

function Filler({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-[var(--theme-text-primary)]">{label}</span>
      <span className="text-xs text-[var(--theme-text-muted)]">Tokenised surface — no raw card shells.</span>
    </div>
  );
}

export const surfaceStory: StoryDef = {
  id: "surface",
  name: "Surface",
  tier: "primitive",
  status: "stable",
  summary:
    "The base surface primitive and its recipes. Reach for a recipe (ContentCard, NestedContentCard, etc.) before hand-rolling a card div.",
  source: "src/components/ui/surface.tsx",
  importLine:
    'import { ContentCard, InteractiveContentCard, NestedContentCard, DangerCallout, Surface } from "@/components/ui/surface";',
  exports: [
    "Surface",
    "InteractiveSurface",
    "EmptyStateSurface",
    "ContentCard",
    "InteractiveContentCard",
    "NestedContentCard",
    "StatusState",
    "DangerCallout",
    "surfaceVariants",
    "interactiveSurfaceVariants",
    "focusRingClassName",
  ],
  intents: [
    { family: "surfaces", need: "Any panel, well, or shell that needs a themed background and border before you reach for a raw div" },
  ],
  examples: [
    {
      label: "ContentCard",
      note: "Default public content card.",
      background: "plain",
      render: () => (
        <ContentCard className="w-full">
          <Filler label="ContentCard" />
        </ContentCard>
      ),
    },
    {
      label: "NestedContentCard",
      note: "Card nested inside another card.",
      background: "plain",
      render: () => (
        <NestedContentCard className="w-full">
          <Filler label="NestedContentCard" />
        </NestedContentCard>
      ),
    },
    {
      label: "InteractiveContentCard",
      note: "Hover/selected affordances for clickable cards.",
      background: "plain",
      render: () => (
        <InteractiveContentCard className="w-full">
          <Filler label="InteractiveContentCard" />
        </InteractiveContentCard>
      ),
    },
    {
      label: "DangerCallout",
      note: "Safety-critical warnings.",
      background: "plain",
      render: () => (
        <DangerCallout className="w-full">
          <Filler label="DangerCallout" />
        </DangerCallout>
      ),
    },
    {
      label: "StatusState / EmptyStateSurface",
      note: "Centered empty & status panels.",
      background: "plain",
      full: true,
      render: () => (
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <StatusState padding="lg">
            <Filler label="StatusState" />
          </StatusState>
          <EmptyStateSurface padding="lg" tone="danger">
            <Filler label="EmptyStateSurface (danger)" />
          </EmptyStateSurface>
        </div>
      ),
    },
    {
      label: "Surface variants",
      note: "Raw variant matrix for reference.",
      background: "plain",
      full: true,
      render: () => (
        <div className="grid w-full gap-3 sm:grid-cols-3">
          {(["card", "public", "subtle", "index", "state", "muted"] as const).map((v) => (
            <Surface key={v} variant={v} padding="md" radius="lg">
              <span className="text-xs text-[var(--theme-text-secondary)]">{v}</span>
            </Surface>
          ))}
        </div>
      ),
    },
    {
      label: "effectPanel",
      note: "Neutral panel for effects vcode surfaces (HeaderedTextbox, TableOfContents).",
      background: "plain",
      render: () => (
        <Surface variant="effectPanel" radius="lg" padding="md" className="w-full">
          <span className="text-xs text-[var(--theme-text-secondary)]">effectPanel</span>
        </Surface>
      ),
    },
    {
      label: "InteractiveSurface",
      note: "Lower-level interactive base.",
      background: "plain",
      render: () => (
        <InteractiveSurface className="w-full" variant="card">
          <Filler label="InteractiveSurface" />
        </InteractiveSurface>
      ),
    },
  ],
  props: [
    {
      name: "variant",
      type: '"card" | "public" | "subtle" | "index" | "state" | "danger" | …',
      default: '"card"',
      description: "Surface treatment; recipes preset sensible variants.",
    },
    { name: "padding", type: '"none" | "xs" | "sm" | "md" | "lg" | "xl"', default: '"lg"', description: "Inner padding scale." },
    { name: "radius", type: '"none" | "md" | "lg" | "xl" | …', default: '"xl"', description: "Corner radius scale." },
    { name: "asChild", type: "boolean", default: "false", description: "Render as the child element via Radix Slot." },
  ],
  whenToUse: [
    "Any card, panel, callout, or empty/status surface.",
    "Clickable cards (InteractiveContentCard) and danger callouts (DangerCallout).",
  ],
  whenNotToUse: [
    "Plain text groupings that need no container — don't wrap everything in a card.",
    "Dev editor panels — those use dev-owned editor primitives.",
  ],
  notes: ["Recipes (ContentCard etc.) are the front door; reach for raw Surface variants only when a recipe doesn't fit."],
};
