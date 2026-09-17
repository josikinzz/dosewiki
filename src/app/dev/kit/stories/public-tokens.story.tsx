import {
  PublicChipNav,
  PublicNameChip,
  PublicOverline,
  PublicPill,
} from "@/components/common/PublicTokens";

import type { StoryDef } from "../registry/types";

export const publicTokensStory: StoryDef = {
  id: "public-tokens",
  name: "Public tokens",
  tier: "common",
  status: "stable",
  summary:
    "Small public-surface text and chip tokens: section overlines, metadata pills, name chips, and a chip-based filter nav. Reach for these before hand-rolling pills or eyebrow labels on public pages.",
  source: "src/components/common/PublicTokens.tsx",
  importLine:
    'import { PublicOverline, PublicPill, PublicNameChip, PublicChipNav } from "@/components/common/PublicTokens";',
  exports: ["PublicChipNav", "PublicNameChip", "PublicOverline", "PublicPill"],
  intents: [
    { family: "chips", need: "The name of a public entity or concept: an effect, a substance, a category, a contributor", example: 3, policy: "#name-chip-policy" },
    { family: "chips", need: "Navigation or filter chips with counts", example: 4, policy: "#name-chip-policy" },
    { family: "pills", need: "Metadata such as dates, dose ranges, or reading time", example: 1, policy: "#name-chip-policy" },
  ],
  examples: [
    {
      label: "PublicOverline",
      note: "Small uppercase eyebrow label above section titles.",
      background: "card",
      render: () => (
        <div className="flex flex-col gap-1">
          <PublicOverline>Section label</PublicOverline>
          <span className="text-base font-semibold text-[var(--theme-text-primary)]">
            Effects overview
          </span>
        </div>
      ),
    },
    {
      label: "PublicPill — tones",
      note: "Static metadata pills across the tone scale.",
      background: "card",
      render: () => (
        <>
          <PublicPill tone="accent">Accent</PublicPill>
          <PublicPill tone="neutral">Neutral</PublicPill>
          <PublicPill tone="success">Success</PublicPill>
          <PublicPill tone="warning">Warning</PublicPill>
          <PublicPill tone="danger">Danger</PublicPill>
        </>
      ),
    },
    {
      label: "PublicPill — sizes & icon",
      note: "sm vs md, with an optional leading Icon.",
      background: "card",
      render: () => (
        <>
          <PublicPill size="sm" tone="neutral" icon="lucide:clock">
            8–12 hrs
          </PublicPill>
          <PublicPill size="md" tone="accent" icon="lucide:flask-conical">
            Stimulant
          </PublicPill>
        </>
      ),
    },
    {
      label: "PublicNameChip",
      note: "Static and interactive (link) variants. Interactive adds a larger hit target.",
      background: "card",
      render: () => (
        <>
          <PublicNameChip icon="lucide:tag">Phenethylamine</PublicNameChip>
          <PublicNameChip as="a" href="#" interactive icon="lucide:link">
            MDMA
          </PublicNameChip>
        </>
      ),
    },
    {
      label: "PublicChipNav",
      note: "Chip-based filter nav; one item active, links via href.",
      background: "card",
      full: true,
      render: () => (
        <PublicChipNav
          ariaLabel="Substance classes"
          items={[
            { id: "all", label: "All", href: "#all", count: 248, active: true },
            { id: "psy", label: "Psychedelics", href: "#psy", count: 64, icon: "lucide:sparkles" },
            { id: "stim", label: "Stimulants", href: "#stim", count: 41 },
            { id: "depr", label: "Depressants", href: "#depr", count: 33 },
          ]}
        />
      ),
    },
    {
      label: "PublicChipNav — button mode",
      note: "Without href, items render as buttons (aria-pressed) and fire onSelect.",
      background: "card",
      full: true,
      render: () => (
        <PublicChipNav
          ariaLabel="View filter"
          items={[
            { id: "common", label: "Common", count: 12, active: true },
            { id: "rare", label: "Rare", count: 4 },
            { id: "all", label: "All", count: 16 },
          ]}
          onSelect={() => {}}
        />
      ),
    },
  ],
  props: [
    {
      name: "as",
      type: "ElementType",
      default: '"span"',
      description:
        "Polymorphic element for PublicOverline / PublicPill / PublicNameChip (e.g. \"a\", \"button\", a heading tag).",
    },
    {
      name: "tone",
      type: '"accent" | "neutral" | "success" | "warning" | "danger"',
      default: '"neutral"',
      description: "PublicPill colour tone; also accepted per item in PublicChipNav.",
    },
    {
      name: "size",
      type: '"sm" | "md"',
      default: '"md"',
      description: "PublicPill padding/type scale and icon size.",
    },
    {
      name: "icon",
      type: "IconName",
      description: "Optional leading Iconify icon for PublicPill / PublicNameChip (e.g. \"lucide:clock\").",
    },
    {
      name: "interactive",
      type: "boolean",
      default: "false",
      description: "PublicNameChip: adds hover/focus affordances and a larger touch hit target when used as a link/button.",
    },
    {
      name: "items",
      type: "PublicChipNavItem[]",
      description: "PublicChipNav entries: { id, label, active?, count?, href?, icon?, tone? }.",
    },
    {
      name: "onSelect",
      type: "(item: PublicChipNavItem) => void",
      description: "PublicChipNav: callback for hrefless items, which then render as buttons.",
    },
    {
      name: "ariaLabel",
      type: "string",
      default: '"Filters"',
      description: "PublicChipNav: accessible label for the surrounding <nav>.",
    },
  ],
  whenToUse: [
    "Eyebrow/overline labels above public section headings (PublicOverline).",
    "Compact static metadata pills — class, schedule, duration (PublicPill).",
    "Inline name/alias chips, optionally linked (PublicNameChip).",
    "Public filter or category navigation rendered as chips (PublicChipNav).",
  ],
  whenNotToUse: [
    "Editor/dev chrome — these are tuned for public page surfaces.",
    "Primary status badges in dense tables — use the Badge primitive instead.",
    "Long-form or multi-line content — these tokens are single-line.",
  ],
  notes: [
    "PublicPill, PublicNameChip, and PublicOverline are polymorphic via `as`; pass href/onClick props through to the chosen element.",
    "PublicChipNav builds on PublicPill: items with href render as <a> (aria-current), hrefless items render as <button> (aria-pressed).",
    "Tones map onto theme badge tokens; styling stays on --theme-* utilities rather than raw colours.",
  ],
};
