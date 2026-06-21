import {
  PublicAttributionSection,
  PublicContentSection,
  PublicDetailHero,
  PublicFactTile,
  PublicMetadataList,
} from "@/components/layout/PublicContentPrimitives";
import { PublicPill } from "@/components/common/PublicTokens";

import type { StoryDef } from "../registry/types";

export const publicContentPrimitivesStory: StoryDef = {
  id: "public-content-primitives",
  name: "Public content primitives",
  tier: "layout",
  status: "stable",
  summary:
    "Public-article building blocks — fact tiles, metadata lists, attribution chips, detail heroes, and content section shells used across effect and trip-report pages.",
  source: "src/components/layout/PublicContentPrimitives.tsx",
  importLine:
    'import { PublicDetailHero, PublicContentSection, PublicMetadataList, PublicFactTile, PublicAttributionSection } from "@/components/layout/PublicContentPrimitives";',
  exports: [
    "PublicMetadataList",
    "PublicFactTile",
    "PublicAttributionSection",
    "PublicDetailHero",
    "PublicContentSection",
  ],
  examples: [
    {
      label: "PublicFactTile",
      note: "Compact label/value tile. Add href to make it an external link.",
      background: "plain",
      full: true,
      render: () => (
        <div className="grid w-full gap-3 sm:grid-cols-3">
          <PublicFactTile icon="lucide:clock" label="Onset" value="20–40 minutes" />
          <PublicFactTile
            icon="lucide:activity"
            label="Duration"
            value="4–6 hours"
            meta="Plateau included"
          />
          <PublicFactTile
            icon="lucide:external-link"
            label="Source"
            value="PsychonautWiki"
            href="https://psychonautwiki.org"
          />
        </div>
      ),
    },
    {
      label: "PublicMetadataList — layouts",
      note: "grid (default), stack, and inline. grid/stack render PublicFactTiles; inline is a single muted row.",
      background: "plain",
      full: true,
      render: () => (
        <div className="grid w-full gap-6 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-wider">
              layout=&quot;grid&quot;
            </p>
            <PublicMetadataList
              layout="grid"
              items={[
                { key: "class", icon: "lucide:atom", label: "Class", value: "Phenethylamine" },
                { key: "onset", icon: "lucide:clock", label: "Onset", value: "20–40 min" },
                { key: "duration", icon: "lucide:activity", label: "Duration", value: "4–6 hours" },
                { key: "legal", icon: "lucide:info", label: "Legal", value: "Varies by region" },
              ]}
            />
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-wider">
                layout=&quot;stack&quot;
              </p>
              <PublicMetadataList
                layout="stack"
                items={[
                  { key: "class", icon: "lucide:atom", label: "Class", value: "Phenethylamine" },
                  { key: "onset", icon: "lucide:clock", label: "Onset", value: "20–40 min" },
                ]}
              />
            </div>
            <div className="space-y-2">
              <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-wider">
                layout=&quot;inline&quot;
              </p>
              <PublicMetadataList
                layout="inline"
                items={[
                  { key: "class", icon: "lucide:atom", label: "Class", value: "Phenethylamine" },
                  { key: "onset", icon: "lucide:clock", label: "Onset", value: "20–40 min" },
                  {
                    key: "src",
                    icon: "lucide:external-link",
                    label: "Source",
                    value: "PsychonautWiki",
                    href: "https://psychonautwiki.org",
                  },
                ]}
              />
            </div>
          </div>
        </div>
      ),
    },
    {
      label: "PublicAttributionSection",
      note: "Author/source credit chip. Aligns end by default; supports avatar, link, and trailing actions.",
      background: "plain",
      full: true,
      render: () => (
        <div className="w-full space-y-3">
          <PublicAttributionSection
            align="start"
            text="Submitted by an anonymous contributor"
          />
          <PublicAttributionSection
            text="Adapted from PsychonautWiki"
            href="https://psychonautwiki.org"
            hrefAriaLabel="Open PsychonautWiki"
            hrefTarget="_blank"
            hrefRel="noopener noreferrer"
            actions={
              <PublicPill icon="lucide:external-link" tone="neutral">
                Source
              </PublicPill>
            }
          />
        </div>
      ),
    },
    {
      label: "PublicDetailHero — effect",
      note: "Page header for effect/report detail pages: icon badge, title, inline metadata, summary, and tag pills.",
      background: "plain",
      full: true,
      render: () => (
        <PublicDetailHero
          kind="effect"
          icon="lucide:eye"
          title="Visual distortions"
          summary="A broad category of perceptual changes affecting the way visual information is processed, ranging from subtle drifting to fully immersive geometry."
          metadata={[
            { key: "category", icon: "lucide:layers", label: "Category", value: "Visual" },
            { key: "common", icon: "lucide:activity", label: "Commonality", value: "Common" },
          ]}
          tags={[
            { id: "psychedelic", label: "Psychedelic" },
            { id: "dissociative", label: "Dissociative" },
            "Cannabinoid",
          ]}
        />
      ),
    },
    {
      label: "PublicDetailHero — report with attribution + badges",
      note: "Trip-report variant with badges (top-right) and an attribution chip under the title.",
      background: "plain",
      full: true,
      render: () => (
        <PublicDetailHero
          kind="report"
          icon="lucide:file-text"
          title="A calm evening with 2C-B"
          badges={
            <PublicPill icon="lucide:circle-check" tone="neutral">
              Verified
            </PublicPill>
          }
          attribution={
            <PublicAttributionSection align="start" text="Submitted by an anonymous author" />
          }
          summary="A first-person account describing a measured, low-dose experience taken in a familiar setting."
          tags={["2C-B", "Oral", "Low dose"]}
        />
      ),
    },
    {
      label: "PublicContentSection — layouts",
      note: "plain (rule heading), card (SectionCard shell), and article (scroll-anchored ArticleSection). article needs id + heading + icon.",
      background: "plain",
      full: true,
      render: () => (
        <div className="w-full space-y-8">
          <PublicContentSection layout="plain" heading="Overview" icon="lucide:info">
            <p className="theme-text-secondary text-sm leading-7">
              Plain layout renders a rule-style section heading above its children — the default
              for lightweight public sections.
            </p>
          </PublicContentSection>

          <PublicContentSection layout="card" heading="Effects" icon="lucide:activity">
            <p className="theme-text-secondary text-sm leading-7">
              Card layout wraps content in the shared SectionCard surface with a card-style heading.
            </p>
          </PublicContentSection>

          <PublicContentSection
            layout="article"
            id="dosage"
            heading="Dosage"
            icon="lucide:beaker"
          >
            <p className="theme-text-secondary text-sm leading-7">
              Article layout uses the scroll-anchored ArticleSection (with a section header) so it
              can be linked from a table of contents.
            </p>
          </PublicContentSection>
        </div>
      ),
    },
  ],
  props: [
    {
      name: "PublicMetadataList.items",
      type: "PublicMetadataListItem[]",
      description:
        "Key/label/value rows. Items with empty/false/nullish values are filtered out; the list returns null when nothing remains.",
    },
    {
      name: "PublicMetadataList.layout",
      type: '"grid" | "stack" | "inline"',
      default: '"grid"',
      description: "grid/stack render PublicFactTiles; inline renders a single muted text row.",
    },
    {
      name: "PublicFactTile.{icon,label,value,meta}",
      type: "IconName | ReactNode",
      description: "Tile content. value is required to show the body; meta is a faint footnote line.",
    },
    {
      name: "PublicFactTile.href",
      type: "string",
      description: "When set, the tile becomes an external link (target=_blank, rel=noopener).",
    },
    {
      name: "PublicAttributionSection.align",
      type: '"start" | "center" | "end"',
      default: '"end"',
      description: "Horizontal alignment of the credit chip within its row.",
    },
    {
      name: "PublicAttributionSection.{avatarSrc,avatarHref,href,text,actions}",
      type: "string | ReactNode",
      description:
        "Optional avatar (with its own link), overlay link for the whole chip, credit text, and trailing actions.",
    },
    {
      name: "PublicDetailHero.kind",
      type: '"effect" | "report"',
      description: "Required. Sets data-public-detail-kind for page-level styling hooks.",
    },
    {
      name: "PublicDetailHero.{icon,title,summary,metadata,tags,badges,attribution,media,actions}",
      type: "IconName | ReactNode | PublicMetadataListItem[] | PublicTagItem[]",
      description:
        "Hero content. metadata renders an inline PublicMetadataList; tags render PublicPills; badges float top-right.",
    },
    {
      name: "PublicContentSection.layout",
      type: '"article" | "card" | "plain"',
      default: '"plain"',
      description:
        'Section shell. "article" requires id + heading + icon to mount the ArticleSection; otherwise falls through.',
    },
    {
      name: "PublicContentSection.{heading,icon,id,spacing,delay}",
      type: "ReactNode | IconName | string | number",
      description: "Heading content + icon are paired; id anchors article layout; delay staggers card entry.",
    },
  ],
  whenToUse: [
    "Building public effect and trip-report detail pages from shared, tokenised parts.",
    "Rendering key/value metadata (PublicMetadataList / PublicFactTile) on public articles.",
    "Crediting an author or upstream source with PublicAttributionSection.",
    "Wrapping a public page header (PublicDetailHero) or body section (PublicContentSection).",
  ],
  whenNotToUse: [
    "Dev editor surfaces — these are public-rendering primitives, not editor chrome.",
    "Generic cards or callouts with no public-article semantics — use Surface recipes instead.",
    "Article subsection cards/headers/info cards — reach for ArticleSection.* directly.",
  ],
  notes: [
    "PublicMetadataList hides empty/false/nullish values and renders null when no items remain — safe to pass partial data.",
    'PublicContentSection only mounts the ArticleSection path when layout="article" and id, heading, and icon are all present; otherwise it renders the plain rule-heading section.',
    "PublicDetailHero embeds PublicMetadataList (inline) and PublicPill internally, so it stays visually consistent with the standalone primitives.",
  ],
};
