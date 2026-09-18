import {
  ArticleInfoCard,
  ArticleKeyValueRows,
  ArticleSection,
  ArticleSectionGroup,
  ArticleSectionState,
  ArticleSourceFooter,
  ArticleSubsectionCard,
  ArticleSubsectionHeader,
} from "@/components/common/ArticleSection";

import type { StoryDef } from "../registry/types";

export const articleSectionStory: StoryDef = {
  id: "article-section",
  name: "Article section",
  tier: "common",
  status: "stable",
  summary:
    "The article body toolkit: the top-level ArticleSection shell plus its subsection, info-card, key/value, state, and source-footer recipes used to build public substance pages.",
  source: "src/components/common/ArticleSection.tsx",
  importLine:
    'import { ArticleSection, ArticleSubsectionCard, ArticleInfoCard, ArticleKeyValueRows } from "@/components/common/ArticleSection";',
  exports: [
    "ArticleSection",
    "ArticleSectionGroup",
    "ArticleSubsectionCard",
    "ArticleSubsectionHeader",
    "ArticleInfoCard",
    "ArticleKeyValueRows",
    "ArticleSectionState",
    "ArticleSourceFooter",
  ],
  intents: [
    { family: "dividers", need: "A divider that marks a group transition in reading hierarchy", policy: "#divider-policy" },
  ],
  examples: [
    {
      label: "ArticleSection shell",
      note: "Top-level section with icon header, gradient divider, and body content.",
      background: "plain",
      full: true,
      render: () => (
        <ArticleSection
          id="overview"
          icon="lucide:book-open"
          heading="Overview"
          spacing="none"
          className="w-full"
        >
          <p className="theme-text-secondary text-sm leading-relaxed">
            Section bodies hold ordinary prose plus any of the subsection
            recipes below. The header pairs an icon with the heading and a
            full-width divider line.
          </p>
        </ArticleSection>
      ),
    },
    {
      label: "ArticleSection.* namespace",
      note: "The root also exposes Group, InfoCard, KeyValueRows, State, SourceFooter, SubsectionCard, and SubsectionHeader as static members.",
      background: "plain",
      full: true,
      render: () => (
        <ArticleSection
          id="namespace-demo"
          icon="lucide:layers"
          heading="Dosage"
          spacing="none"
          className="w-full"
        >
          <ArticleSection.SubsectionCard padding="md">
            <ArticleSection.SubsectionHeader
              heading="Oral"
              icon="lucide:pill"
              headingLevel="h3"
            />
            <ArticleSection.KeyValueRows
              className="mt-3"
              rows={[
                { label: "Threshold", value: "5 mg" },
                { label: "Common", value: "15 – 30 mg" },
                { label: "Strong", value: "30 – 50 mg" },
              ]}
            />
          </ArticleSection.SubsectionCard>
        </ArticleSection>
      ),
    },
    {
      label: "ArticleSectionGroup",
      note: "Optional subheading plus vertical rhythm for a cluster of cards.",
      background: "plain",
      full: true,
      render: () => (
        <ArticleSectionGroup
          heading="Routes of administration"
          icon="lucide:route"
          spacing="default"
          className="w-full"
        >
          <ArticleSubsectionCard padding="sm">
            <span className="theme-text-secondary text-sm">Insufflated</span>
          </ArticleSubsectionCard>
          <ArticleSubsectionCard padding="sm">
            <span className="theme-text-secondary text-sm">Rectal</span>
          </ArticleSubsectionCard>
        </ArticleSectionGroup>
      ),
    },
    {
      label: "ArticleSubsectionCard variants",
      note: "subtle, nested, and interactive treatments.",
      background: "plain",
      full: true,
      render: () => (
        <div className="grid w-full gap-3 sm:grid-cols-3">
          {(["subtle", "nested", "interactive"] as const).map((variant) => (
            <ArticleSubsectionCard key={variant} variant={variant} padding="sm">
              <span className="theme-text-secondary text-sm">{variant}</span>
            </ArticleSubsectionCard>
          ))}
        </div>
      ),
    },
    {
      label: "ArticleSubsectionHeader",
      note: "h3/h4 heading with optional icon and a trailing accessory slot.",
      background: "card",
      full: true,
      render: () => (
        <div className="w-full space-y-3">
          <ArticleSubsectionHeader heading="With icon" icon="lucide:flask-conical" />
          <ArticleSubsectionHeader heading="Smaller (h4)" headingLevel="h4" icon="lucide:dot" />
          <ArticleSubsectionHeader heading="With accessory">
            <span className="theme-text-faint text-xs">3 entries</span>
          </ArticleSubsectionHeader>
        </div>
      ),
    },
    {
      label: "ArticleInfoCard tones",
      note: "Titled card with tone-coded icon/ring: neutral, accent, success, warning, danger.",
      background: "plain",
      full: true,
      render: () => (
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <ArticleInfoCard tone="accent" icon="lucide:sparkles" title="Pharmacology">
            Primarily a serotonin receptor agonist.
          </ArticleInfoCard>
          <ArticleInfoCard tone="warning" icon="lucide:triangle-alert" title="Caution">
            Avoid combining with MAOIs.
          </ArticleInfoCard>
          <ArticleInfoCard tone="danger" icon="lucide:octagon-x" title="Dangerous combo">
            Do not mix with tramadol.
          </ArticleInfoCard>
          <ArticleInfoCard
            tone="success"
            icon="lucide:check"
            title="Verified"
            accessory={<span className="theme-text-faint text-xs">2 sources</span>}
          >
            Dosage range corroborated.
          </ArticleInfoCard>
        </div>
      ),
    },
    {
      label: "ArticleKeyValueRows densities",
      note: "Definition-list rows; empty values are filtered out. Rows can carry icons and external links.",
      background: "card",
      full: true,
      render: () => (
        <div className="grid w-full gap-4 sm:grid-cols-2">
          <ArticleKeyValueRows
            density="compact"
            rows={[
              { label: "Class", value: "Phenethylamine", icon: "lucide:atom" },
              { label: "Half-life", value: "~5 hours" },
              { label: "Hidden (empty)", value: "" },
            ]}
          />
          <ArticleKeyValueRows
            density="comfortable"
            rows={[
              { label: "CAS number", value: "66142-81-2" },
              { label: "Source", value: "PubChem", href: "https://pubchem.ncbi.nlm.nih.gov" },
            ]}
          />
        </div>
      ),
    },
    {
      label: "ArticleSectionState",
      note: "loading, empty, and error placeholders for missing or unavailable section data.",
      background: "plain",
      full: true,
      render: () => (
        <div className="grid w-full gap-3">
          <ArticleSectionState kind="loading" />
          <ArticleSectionState kind="empty" />
          <ArticleSectionState kind="error" />
        </div>
      ),
    },
    {
      label: "ArticleSourceFooter",
      note: "Right-aligned attribution row. Pass a source pill config or arbitrary children.",
      background: "card",
      full: true,
      render: () => (
        <ArticleSourceFooter
          source={{ label: "PsychonautWiki", prefix: "Sourced from", href: "https://psychonautwiki.org" }}
        />
      ),
    },
  ],
  props: [
    {
      name: "ArticleSection.icon / heading / id",
      type: "IconName / string / string",
      description: "Required header icon, title, and the section id used for in-page anchors.",
    },
    {
      name: "ArticleSection.spacing",
      type: '"article" | "effect" | "none"',
      default: '"article"',
      description: "Top padding and scroll-margin preset for the section shell.",
    },
    {
      name: "ArticleSubsectionCard.variant / padding",
      type: '"subtle" | "nested" | "interactive" / "none" | "xs" | "sm" | "md"',
      default: '"subtle" / "md"',
      description: "Card surface treatment and inner padding scale.",
    },
    {
      name: "ArticleInfoCard.tone",
      type: '"neutral" | "accent" | "success" | "warning" | "danger"',
      default: '"neutral"',
      description: "Tone-codes the title, icon colour, and ring.",
    },
    {
      name: "ArticleKeyValueRows.rows / density",
      type: 'ArticleKeyValueRow[] / "compact" | "comfortable"',
      default: '— / "compact"',
      description: "Rows render as a <dl>; rows with empty values are dropped automatically.",
    },
    {
      name: "ArticleSectionState.kind",
      type: '"loading" | "empty" | "error"',
      default: '"empty"',
      description: "Picks default icon/title/copy and role/aria semantics.",
    },
    {
      name: "ArticleSourceFooter.align / source",
      type: '"start" | "center" | "end" / ExternalSourcePillProps',
      default: '"end" / —',
      description: "Footer alignment and the attribution pill config (or fall back to children).",
    },
  ],
  whenToUse: [
    "Composing public substance/effect article bodies from consistent section primitives.",
    "Titled info cards, key/value spec rows, and tone-coded callouts inside a section.",
    "Standardised loading/empty/error placeholders and source attribution footers.",
  ],
  whenNotToUse: [
    "Non-article page chrome — use layout-tier shells instead.",
    "Generic clickable cards outside article context — reach for the Surface recipes.",
    "Dev editor panels — those use dev-owned editor primitives.",
  ],
  notes: [
    "ArticleSection is the root export with Group, InfoCard, KeyValueRows, State, SourceFooter, SubsectionCard, and SubsectionHeader attached as static members, so a single import covers the whole namespace.",
    "ArticleInfoCard defaults to the interactive subsection variant; ArticleSectionState wraps a subsection card with role=status (or alert for error) and aria-busy while loading.",
    "ArticleKeyValueRows returns null (or the emptyState prop) when every row value is empty.",
  ],
};
