import { Button } from "@/components/ui/button";
import {
  ArticleContributorAttribution,
  MediaPlaceholder,
  MediaTile,
  PublicSkeletonSurface,
  SkeletonPulse,
  SkeletonSection,
  StatusActions,
  StatusFact,
  StatusHeader,
  type PublicSkeletonSectionModel,
  type PublicSkeletonSurfaceModel,
} from "@/components/layout/PublicFeedbackPrimitives";

import type { StoryDef } from "../registry/types";

const skeletonSection: PublicSkeletonSectionModel = {
  key: "demo-card",
  variant: "card",
  columns: 1,
  blocks: [
    { width: "w-1/3", height: "h-3", tone: "strong" },
    { width: "w-full", height: "h-4" },
    { width: "w-2/3", height: "h-4" },
  ],
};

const skeletonSurfaceModel: PublicSkeletonSurfaceModel = {
  density: "normal",
  label: "Loading article",
  pendingLabel: "Loading content, please wait.",
  stalledLabel: "Still loading.",
  headingBlocks: [
    { width: "w-2/3", height: "h-7", tone: "strong" },
    { width: "w-1/2", height: "h-4" },
  ],
  sections: [
    {
      key: "surface-a",
      variant: "article",
      columns: 2,
      blocks: [
        { width: "w-1/3", height: "h-3", tone: "strong" },
        { width: "w-full", height: "h-4" },
        { width: "w-5/6", height: "h-4" },
      ],
    },
    {
      key: "surface-b",
      variant: "list",
      columns: 2,
      blocks: [
        { width: "w-1/4", height: "h-3" },
        { width: "w-full", height: "h-4" },
        { width: "w-3/4", height: "h-4" },
      ],
    },
  ],
};

export const publicFeedbackPrimitivesStory: StoryDef = {
  id: "public-feedback-primitives",
  name: "Public feedback primitives",
  tier: "layout",
  status: "stable",
  summary:
    "Loading, status, media, and attribution building blocks for public pages — skeletons, status headers/facts/actions, media tiles, and contributor credit.",
  source: "src/components/layout/PublicFeedbackPrimitives.tsx",
  importLine:
    'import { PublicSkeletonSurface, StatusHeader, StatusFact, StatusActions, MediaTile, MediaPlaceholder, ArticleContributorAttribution } from "@/components/layout/PublicFeedbackPrimitives";',
  exports: [
    "SkeletonPulse",
    "SkeletonSection",
    "PublicSkeletonSurface",
    "StatusHeader",
    "StatusActions",
    "StatusFact",
    "MediaPlaceholder",
    "MediaTile",
    "ArticleContributorAttribution",
  ],
  examples: [
    {
      label: "SkeletonPulse",
      note: "Single shimmering placeholder bar; size via width/height, tone via strong/soft.",
      background: "card",
      render: () => (
        <div className="flex w-full flex-col gap-3">
          <SkeletonPulse width="w-2/3" height="h-5" tone="strong" />
          <SkeletonPulse width="w-full" height="h-4" />
          <SkeletonPulse width="w-1/2" height="h-4" tone="soft" />
        </div>
      ),
    },
    {
      label: "SkeletonSection",
      note: "A shell of pulses driven by one section model (card / list / article / section).",
      background: "subtle",
      render: () => (
        <div className="w-full">
          <SkeletonSection section={skeletonSection} />
        </div>
      ),
    },
    {
      label: "PublicSkeletonSurface",
      note: "Full route loading scaffold: heading blocks plus a grid of sections with a11y status text.",
      background: "subtle",
      full: true,
      render: () => <PublicSkeletonSurface model={skeletonSurfaceModel} />,
    },
    {
      label: "StatusHeader",
      note: "Badge + status orb + title + description for status pages (StatusPageShell).",
      background: "card",
      full: true,
      render: () => (
        <StatusHeader
          badge="Under construction"
          badgeVariant="secondary"
          statusIcon="lucide:hammer"
          statusTone="warning"
          title="This page is being built"
          description="We are migrating this article into the new format. Check back soon for the full write-up."
        />
      ),
    },
    {
      label: "StatusActions",
      note: "Flex row wrapper for status-page buttons; align start / center / end.",
      background: "card",
      full: true,
      render: () => (
        <div className="flex w-full flex-col gap-4">
          <StatusActions align="start">
            <Button variant="default">Browse substances</Button>
            <Button variant="outline">Go home</Button>
          </StatusActions>
          <StatusActions align="end">
            <Button variant="ghost">Dismiss</Button>
            <Button variant="default">Continue</Button>
          </StatusActions>
        </div>
      ),
    },
    {
      label: "StatusFact",
      note: "Compact labelled fact tile for supporting metadata on status surfaces.",
      background: "subtle",
      render: () => (
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <StatusFact label="Status" value="Draft in review" />
          <StatusFact label="Last updated" value="June 2026" />
        </div>
      ),
    },
    {
      label: "StatusFact (plain)",
      note: "tone=\"plain\" drops the card chrome for flat side rails that list facts or links without nested boxes.",
      background: "subtle",
      render: () => (
        <div className="grid w-full gap-4 sm:grid-cols-2">
          <StatusFact tone="plain" label="Status" value="Draft in review" />
          <StatusFact tone="plain" label="Last updated" value="June 2026" />
        </div>
      ),
    },
    {
      label: "MediaPlaceholder",
      note: "Empty and loading fallbacks shown when a media thumbnail is missing or pending.",
      background: "plain",
      full: true,
      render: () => (
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <div className="aspect-square overflow-hidden rounded-xl border [border-color:var(--theme-border)]">
            <MediaPlaceholder kind="empty" title="Media unavailable" description="No image on file" />
          </div>
          <div className="aspect-square overflow-hidden rounded-xl border [border-color:var(--theme-border)]">
            <MediaPlaceholder kind="loading" />
          </div>
        </div>
      ),
    },
    {
      label: "MediaTile",
      note: "Square gallery tile. With a thumbnail the caption overlays the image; without one, MediaPlaceholder carries the title and credit line alone.",
      background: "plain",
      full: true,
      render: () => (
        <div className="grid w-full gap-3 sm:grid-cols-3">
          <MediaTile title="Crystal sample" creator="by Lab archive" mediaType="image" />
          <MediaTile title="Synthesis walkthrough" creator="by Contributor" mediaType="video" />
          <MediaTile title="Field recording" creator="Creator unknown" mediaType="audio" />
        </div>
      ),
    },
    {
      label: "ArticleContributorAttribution",
      note: "Credit pill linking the original subjective-effects author; internal or external href.",
      background: "card",
      full: true,
      render: () => (
        <div className="w-full pb-8">
          <ArticleContributorAttribution
            author="Josie Kins"
            authorHref="https://en.wikipedia.org/wiki/Josie_Kins"
            text="Subjective effects documentation by Josie Kins, adapted for dose.wiki."
            url="https://example.com/source"
          />
        </div>
      ),
    },
  ],
  props: [
    {
      name: "SkeletonPulse.block",
      type: "PublicSkeletonBlock",
      description: "Drives width/height/tone in one object; explicit width/height/tone props override it.",
    },
    {
      name: "SkeletonSection.section",
      type: "PublicSkeletonSectionModel",
      description: "Section model whose variant (card/list/article/section) picks the shell treatment.",
    },
    {
      name: "PublicSkeletonSurface.model",
      type: "PublicSkeletonSurfaceModel",
      description: "Full scaffold: density, heading blocks, sections, and screen-reader status labels.",
    },
    {
      name: "StatusHeader.statusIcon / statusTone",
      type: "IconName / status tone",
      default: '"accent"',
      description: "Optional plain glyph rendered above the title; tone sets its colour.",
    },
    {
      name: "StatusActions.align",
      type: '"start" | "center" | "end"',
      default: '"start"',
      description: "Horizontal justification of the wrapped action buttons.",
    },
    {
      name: "StatusFact.tone",
      type: '"boxed" | "plain"',
      default: '"boxed"',
      description: "boxed renders the bordered tile; plain drops the card chrome for flat side rails of facts or links.",
    },
    {
      name: "MediaPlaceholder.kind",
      type: '"empty" | "loading"',
      default: '"empty"',
      description: "Empty shows an icon; loading shows a pulse and sets role=status / aria-busy.",
    },
    {
      name: "MediaTile.onClick / resourceUrl",
      type: "() => void / string",
      description: "onClick renders a <button>; resourceUrl renders an external <a>; neither renders a plain div.",
    },
    {
      name: "ArticleContributorAttribution.authorHref",
      type: "string",
      description: "http(s) hrefs render an external anchor; relative paths render a Next <Link>.",
    },
  ],
  whenToUse: [
    "Skeleton placeholders for public route and section loading states.",
    "Under-construction / status pages (header, facts, action row).",
    "Public media galleries and the original-contributor credit pill.",
  ],
  whenNotToUse: [
    "Dev editor loading or status chrome — those use editor-owned primitives.",
    "Generic spinners or toasts — these are page-shaped feedback blocks, not transient notices.",
  ],
  notes: [
    "Skeletons honor motion-reduce and expose polite aria-live status text for assistive tech.",
    "MediaTile reuses MediaPlaceholder as its no-thumbnail fallback, so the two stay visually consistent.",
    "ArticleContributorAttribution carries a negative bottom margin (articleSectionAdornmentClassName) to tuck under the preceding section.",
  ],
};
