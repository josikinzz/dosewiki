import { ArticleCitationList } from "@/components/common/ArticleCitationList";

import type { StoryDef } from "../registry/types";

const sampleCitations = [
  {
    number: 1,
    anchorId: "ref-shulgin-pihkal",
    label: "Shulgin, A. & Shulgin, A. — PiHKAL: A Chemical Love Story",
    href: "https://example.org/pihkal",
  },
  {
    number: 2,
    anchorId: "ref-erowid-vault",
    label: "Erowid Psychoactive Vaults",
    href: "https://example.org/erowid-vault",
  },
  {
    number: 3,
    anchorId: "ref-cochrane",
    label: "Cochrane Database of Systematic Reviews",
    href: "https://example.org/cochrane",
  },
] as const;

const labelOnlyCitations = [
  { number: 1, id: "note-a", label: "Unpublished correspondence (no source URL)" },
  { number: 2, id: "note-b", label: "Author observation" },
] as const;

const longLabelCitation = [
  {
    number: 1,
    anchorId: "ref-long",
    label:
      "A National Institute on Drug Abuse longitudinal cohort study of subjective effects across repeated low-dose administration in healthy adult volunteers",
    href: "https://example.org/very-long-title",
  },
] as const;

export const articleCitationListStory: StoryDef = {
  id: "article-citation-list",
  name: "ArticleCitationList",
  tier: "common",
  status: "stable",
  summary:
    "Inline wrap-flow list of numbered citation chips for article bodies. Wraps CitationListItem and normalises the href/favicon/anchor field aliases that come off article data.",
  source: "src/components/common/ArticleCitationList.tsx",
  importLine:
    'import { ArticleCitationList } from "@/components/common/ArticleCitationList";',
  exports: ["ArticleCitationList"],
  examples: [
    {
      label: "Linked citations",
      note: "Default state: numbered chips that link out to each source.",
      background: "card",
      full: true,
      render: () => <ArticleCitationList citations={sampleCitations} />,
    },
    {
      label: "Label-only citations",
      note: "Citations with no href render as static chips (no link affordance).",
      background: "card",
      full: true,
      render: () => <ArticleCitationList citations={labelOnlyCitations} />,
    },
    {
      label: "showHref",
      note: "Adds an external-link glyph to chips that have an href.",
      background: "card",
      full: true,
      render: () => <ArticleCitationList citations={sampleCitations} showHref />,
    },
    {
      label: "truncateLabels off",
      note: "Long labels wrap instead of truncating to a single ellipsised line.",
      background: "card",
      full: true,
      render: () => (
        <div className="grid w-full gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="text-xs text-[var(--theme-text-muted)]">
              truncateLabels (default)
            </span>
            <ArticleCitationList citations={longLabelCitation} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-[var(--theme-text-muted)]">
              truncateLabels=false
            </span>
            <ArticleCitationList citations={longLabelCitation} truncateLabels={false} />
          </div>
        </div>
      ),
    },
  ],
  props: [
    {
      name: "citations",
      type: "readonly ArticleCitationListCitation[]",
      description:
        "Citation entries. Each has a number plus optional label, href/url, faviconSrc/favicon, and anchorId/id (aliases are normalised internally).",
    },
    {
      name: "showHref",
      type: "boolean",
      default: "false",
      description: "Show an external-link glyph on chips that carry an href.",
    },
    {
      name: "truncateLabels",
      type: "boolean",
      default: "true",
      description: "Truncate each label to one line; set false to let labels wrap.",
    },
    {
      name: "getKey",
      type: "(citation, index) => string",
      description:
        "Override the React key derivation; defaults to role/anchor/href/number composite.",
    },
    {
      name: "itemClassName",
      type: "string",
      description: "Extra classes forwarded to each CitationListItem <li>.",
    },
    {
      name: "className",
      type: "string",
      description: "Classes merged onto the wrapping <ol>; spreads remaining <ol> props.",
    },
  ],
  whenToUse: [
    "Rendering an article's reference list as compact, wrapping numbered chips.",
    "Surfacing citations that mix linked sources and label-only notes in one flow.",
  ],
  whenNotToUse: [
    "Single inline citation markers in running prose — use the per-item citation token instead.",
    "Editor-side citation management UIs, which have their own dev-owned controls.",
  ],
  notes: [
    "Renders an <ol> of CitationListItem chips and forwards spare <ol> props.",
    "Field aliases are resolved per item: href ?? url, faviconSrc ?? favicon, anchorId ?? id.",
  ],
};
