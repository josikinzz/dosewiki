import {
  ContributorAvatar,
  ContributorCard,
  IconPillLink,
  PublicContentShell,
  PublicSectionHeading,
  SearchMetaChips,
  SearchResultCard,
  TaxonomyGroupSection,
} from "@/components/layout/PublicPagePrimitives";
import { Button } from "@/components/ui/button";

import type { StoryDef } from "../registry/types";

export const publicPagePrimitivesStory: StoryDef = {
  id: "public-page-primitives",
  name: "Public page primitives",
  tier: "layout",
  status: "stable",
  summary:
    "The shared building blocks for public read-only pages: content shell, section headings, contributor cards, taxonomy lists, and search result rows.",
  source: "src/components/layout/PublicPagePrimitives.tsx",
  importLine:
    'import { PublicContentShell, PublicSectionHeading, ContributorCard, TaxonomyGroupSection, SearchResultCard } from "@/components/layout/PublicPagePrimitives";',
  exports: [
    "PublicContentShell",
    "PublicSectionHeading",
    "ContributorAvatar",
    "ContributorCard",
    "IconPillLink",
    "TaxonomyGroupSection",
    "SearchMetaChips",
    "SearchResultCard",
  ],
  examples: [
    {
      label: "PublicContentShell",
      note: "Centered, width-capped page container. Rendered here as a <section> with a visible border to show the bounds.",
      background: "subtle",
      full: true,
      render: () => (
        <PublicContentShell
          as="section"
          width="narrow"
          className="min-h-0 rounded-2xl border border-[var(--theme-border)] py-6"
        >
          <p className="theme-text-secondary text-sm">
            Page body content sits inside the shell. The shell caps the max
            width (narrow / standard / wide), centers it, and supplies public
            page padding.
          </p>
        </PublicContentShell>
      ),
    },
    {
      label: "PublicSectionHeading — rule",
      note: "Default top-level heading with an icon and a trailing divider rule.",
      background: "card",
      full: true,
      render: () => (
        <PublicSectionHeading
          icon="lucide:book-open"
          title="Effects"
          actions={
            <Button variant="ghost" size="sm">
              View all
            </Button>
          }
        />
      ),
    },
    {
      label: "PublicSectionHeading — card & action",
      note: "card uses an IconBadge for in-card headers; action right-aligns its actions.",
      background: "card",
      full: true,
      render: () => (
        <div className="flex w-full flex-col gap-6">
          <PublicSectionHeading
            variant="card"
            icon="lucide:list"
            title="Common names"
          />
          <PublicSectionHeading
            variant="action"
            icon="lucide:flask-conical"
            title="Pharmacology"
            actions={
              <Button variant="secondary" size="sm">
                Cite
              </Button>
            }
          />
        </div>
      ),
    },
    {
      label: "ContributorAvatar — sizes & initials",
      note: "Falls back to initials when no image URL is supplied. xs / sm / md / lg.",
      background: "card",
      render: () => (
        <div className="flex items-end gap-4">
          <ContributorAvatar name="Josie Kins" size="xs" />
          <ContributorAvatar name="Ada Lovelace" size="sm" />
          <ContributorAvatar name="Grace Hopper" size="md" />
          <ContributorAvatar name="Marie Curie" size="lg" lifted />
        </div>
      ),
    },
    {
      label: "ContributorCard",
      note: "Avatar + name + handle, links to the contributor page; hover reveals the arrow.",
      background: "subtle",
      full: true,
      render: () => (
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <ContributorCard
            href="#"
            contributor={{
              key: "josie",
              displayName: "Josie Kins",
              subtitle: "Editor",
            }}
          />
          <ContributorCard
            href="#"
            contributor={{
              key: "contributor",
              displayName: "Anonymous Contributor",
            }}
          />
        </div>
      ),
    },
    {
      label: "IconPillLink",
      note: "Pill-styled link with leading icon; external URLs get target=_blank and an external-link glyph.",
      background: "card",
      render: () => (
        <div className="flex flex-wrap gap-2">
          <IconPillLink icon="lucide:globe" label="Internal page" href="#" />
          <IconPillLink
            icon="lucide:book"
            label="PsychonautWiki"
            href="https://psychonautwiki.org"
          />
        </div>
      ),
    },
    {
      label: "TaxonomyGroupSection — list",
      note: "Groups of linked items inside section cards; default list layout.",
      background: "subtle",
      full: true,
      render: () => (
        <TaxonomyGroupSection
          icon="lucide:tag"
          label="Stimulants"
          groups={[
            {
              id: "phenethylamines",
              title: "Phenethylamines",
              items: [
                { id: "amphetamine", label: "Amphetamine", href: "#", meta: "12" },
                { id: "mdma", label: "MDMA", href: "#", meta: "8" },
              ],
            },
          ]}
        />
      ),
    },
    {
      label: "TaxonomyGroupSection — grid & empty",
      note: "Grid layout for wider lists; empty groups render the emptyText fallback.",
      background: "subtle",
      full: true,
      render: () => (
        <div className="flex w-full flex-col gap-4">
          <TaxonomyGroupSection
            icon="lucide:grid-3x3"
            label="Tryptamines"
            displayMode="grid"
            groups={[
              {
                id: "classic",
                title: "Classic psychedelics",
                items: [
                  { id: "psilocybin", label: "Psilocybin", href: "#" },
                  { id: "dmt", label: "DMT", href: "#" },
                  { id: "lsd", label: "LSD", href: "#" },
                  { id: "mescaline", label: "Mescaline", href: "#" },
                ],
              },
            ]}
          />
          <TaxonomyGroupSection
            icon="lucide:tag"
            label="Orphans"
            groups={[]}
          />
        </div>
      ),
    },
    {
      label: "SearchMetaChips",
      note: "Wrapping metadata pills with optional query highlighting.",
      background: "card",
      render: () => (
        <SearchMetaChips
          highlightedQuery="empath"
          items={[
            { id: "class", label: "Entactogen" },
            { id: "alias", label: "Empathogen" },
            { id: "route", label: "Oral" },
          ]}
        />
      ),
    },
    {
      label: "SearchResultCard",
      note: "Full search result row: type overline, best-match pill, icon, highlighted label, secondary line, and meta chips.",
      background: "subtle",
      full: true,
      render: () => (
        <div className="flex w-full flex-col gap-3">
          <SearchResultCard
            highlightedQuery="ketamine"
            result={{
              id: "ketamine",
              href: "#",
              typeLabel: "Substance",
              label: "Ketamine",
              secondary:
                "Dissociative anaesthetic with analgesic and psychedelic effects at sub-anaesthetic doses.",
              icon: "lucide:pill",
              isBestMatch: true,
              metaChips: [
                { id: "class", label: "Dissociative" },
                { id: "route", label: "Insufflated" },
              ],
            }}
          />
          <SearchResultCard
            highlightedQuery=""
            result={{
              id: "effect",
              href: "#",
              typeLabel: "Effect",
              label: "Time distortion",
              icon: "lucide:clock",
            }}
          />
        </div>
      ),
    },
  ],
  props: [
    {
      name: "PublicContentShell.as",
      type: '"main" | "div" | "section"',
      default: '"main"',
      description: "Host element. Defaults to <main> for the primary page region.",
    },
    {
      name: "PublicContentShell.width",
      type: '"narrow" | "standard" | "wide"',
      default: '"standard"',
      description: "Max-width cap (3xl / 4xl / 6xl).",
    },
    {
      name: "PublicContentShell.focusTarget",
      type: "boolean",
      default: "false",
      description: "Adds id=main-content and tabIndex=-1 as a skip-link focus target.",
    },
    {
      name: "PublicSectionHeading.variant",
      type: '"rule" | "card" | "action"',
      default: '"rule"',
      description: "rule = top-level with divider; card = in-card with IconBadge; action = right-aligned actions.",
    },
    {
      name: "PublicSectionHeading.title / icon / actions",
      type: "ReactNode / IconName / ReactNode",
      description: "Heading text, optional leading icon, and optional trailing action slot.",
    },
    {
      name: "ContributorAvatar.size",
      type: '"xs" | "sm" | "md" | "lg"',
      default: '"sm"',
      description: "Avatar frame size; uses imageUrl or initials from name.",
    },
    {
      name: "ContributorCard.contributor / href",
      type: "ContributorCardContributor / string",
      description: "Contributor model (key, displayName, avatarUrl, subtitle) and the link target.",
    },
    {
      name: "IconPillLink.external",
      type: "boolean",
      description: "Force external behaviour; otherwise inferred from an http(s) href.",
    },
    {
      name: "TaxonomyGroupSection.displayMode",
      type: '"list" | "grid"',
      default: '"list"',
      description: "Item layout inside each group card.",
    },
    {
      name: "SearchResultCard.result / highlightedQuery",
      type: "SearchResultCardModel / string",
      description: "Result model plus the active query used to highlight matching label and chip text.",
    },
  ],
  whenToUse: [
    "Building public read-only pages (substance, effects, taxonomy, search, contributor index).",
    "Top-level and in-card section headers via PublicSectionHeading instead of bare <h2>.",
    "Search and taxonomy listings that need consistent cards, chips, and highlighting.",
  ],
  whenNotToUse: [
    "Dev editor surfaces — those use editor-owned primitives, not the public shell.",
    "Interactive, stateful search UIs — these are presentational; wire data/state at the page level.",
  ],
  notes: [
    "All pieces are presentational and mount with plain props; the live examples above use inline mock data.",
    "ContributorAvatar takes its depth cast from `lifted`; ContributorCard hover affordances respond to a parent .group hover.",
    "SearchResultCard composes SearchMetaChips internally and uses the result surface variant.",
  ],
};
