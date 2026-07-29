import {
  IndexCard,
  IndexCardList,
  IndexCardListItem,
  IndexCardSection,
} from "@/components/common/IndexCard";

import type { StoryDef } from "../registry/types";

/** Minimal inline stand-in for the IndexCardList / IndexCardListItem siblings. */
function MockList({ items }: { items: string[] }) {
  return (
    <ul className="-mb-1 space-y-1.5 pb-1">
      {items.map((label) => (
        <li key={label}>
          <span className="theme-index-card-link theme-text-secondary mx-1 flex w-[calc(100%-1rem)] items-center rounded-xl px-3 py-2.5 text-left text-[0.9375rem]">
            <span className="theme-index-card-bullet mr-3 inline-block h-1.5 w-1.5 shrink-0 rounded-full" />
            {label}
          </span>
        </li>
      ))}
    </ul>
  );
}

const STIMULANTS = ["Amphetamine", "Caffeine", "Cocaine", "Methylphenidate"];

export const indexCardStory: StoryDef = {
  id: "index-card",
  name: "IndexCard",
  tier: "common",
  status: "stable",
  summary:
    "Collapsible panel used by the Substance and Effect index pages: glass surface, icon + counted title, and an expand/collapse region for its list of items.",
  source: "src/components/common/IndexCard.tsx",
  importLine: 'import { IndexCard } from "@/components/common/IndexCard";',
  exports: ["IndexCard"],
  examples: [
    {
      label: "Default (expanded)",
      note: "Icon, counted title, chevron, and a collapsible body. Starts open.",
      background: "subtle",
      render: () => (
        <IndexCard title="Stimulants" icon="lucide:zap" count={STIMULANTS.length}>
          <MockList items={STIMULANTS} />
        </IndexCard>
      ),
    },
    {
      label: "Collapsed",
      note: "Controlled collapsed state via expanded={false}; the body animates to zero height.",
      background: "subtle",
      render: () => (
        <IndexCard
          title="Psychedelics"
          icon="lucide:eye"
          count={3}
          expanded={false}
        >
          <MockList items={["LSD", "Psilocybin", "Mescaline"]} />
        </IndexCard>
      ),
    },
    {
      label: "Dim tone",
      note: 'tone="dim" swaps the purple index surface for a neutral grey panel.',
      background: "subtle",
      render: () => (
        <IndexCard
          title="Depressants"
          icon="lucide:moon"
          count={2}
          tone="dim"
        >
          <MockList items={["Alcohol", "GHB"]} />
        </IndexCard>
      ),
    },
    {
      label: "With description",
      note: "Optional sub-label sits under the title.",
      background: "subtle",
      render: () => (
        <IndexCard
          title="Dissociatives"
          icon="lucide:waves"
          count={2}
          description="NMDA antagonists and related agents"
        >
          <MockList items={["Ketamine", "Nitrous oxide"]} />
        </IndexCard>
      ),
    },
    {
      label: "Icon hidden",
      note: "hideIcon collapses the header to title + chevron and inlines the count badge. Used for single-class tabs where the glyph is redundant.",
      background: "subtle",
      render: () => (
        <IndexCard
          title="Opioids"
          icon="lucide:pill"
          count={3}
          hideIcon
        >
          <MockList items={["Codeine", "Morphine", "Tramadol"]} />
        </IndexCard>
      ),
    },
    {
      label: "Linked title",
      note: "titleHref makes the title a navigation link (renders a next/link).",
      background: "subtle",
      render: () => (
        <IndexCard
          title="Cannabinoids"
          icon="lucide:leaf"
          count={2}
          titleHref="/?category=cannabinoids"
        >
          <MockList items={["THC", "CBD"]} />
        </IndexCard>
      ),
    },
    {
      label: "Sectioned rows, qualifiers, and sub-items",
      note: "The real IndexCardSection / IndexCardList / IndexCardListItem siblings. A section groups rows under a linked label; meta sets a quiet qualifier at the row's trailing edge; depth={1} marks a row as belonging to the one above it.",
      background: "subtle",
      render: () => (
        <IndexCard title="Cognitive" icon="fluent:thinking-24-regular" count={4}>
          <IndexCardSection title="near universal" count={2} titleHref="/effects">
            <IndexCardList>
              <IndexCardListItem
                label="Analysis suppression"
                href="/effects/analysis-suppression"
                meta="(common)"
              />
              <IndexCardListItem label="Nausea" href="/effects/nausea" meta="(frequent)" />
              <IndexCardListItem
                label="Vomiting"
                href="/effects/nausea"
                meta="(common)"
                depth={1}
              />
            </IndexCardList>
          </IndexCardSection>
          <IndexCardSection title="frequent" count={1} showDivider>
            <IndexCardList>
              <IndexCardListItem label="Wakefulness" href="/effects/wakefulness" />
            </IndexCardList>
          </IndexCardSection>
        </IndexCard>
      ),
    },
    {
      label: "Singular count",
      note: "Count badge pluralises its aria-label automatically (1 item vs N items).",
      background: "subtle",
      render: () => (
        <IndexCard title="Empathogens" icon="lucide:heart" count={1}>
          <MockList items={["MDMA"]} />
        </IndexCard>
      ),
    },
  ],
  props: [
    { name: "title", type: "string", description: "Card heading; also feeds default toggle and action aria-labels." },
    { name: "icon", type: "IconName", description: "Leading glyph (Iconify name, e.g. \"lucide:zap\"). Doubles as the optional copy-list control." },
    { name: "count", type: "number", description: "Item count shown in the badge beside the title." },
    { name: "children", type: "ReactNode", description: "Collapsible body content — typically an item list." },
    { name: "defaultExpanded", type: "boolean", default: "true", description: "Initial open state in uncontrolled mode." },
    { name: "expanded", type: "boolean", description: "Controlled open state; pair with onExpandedChange." },
    { name: "onExpandedChange", type: "(expanded: boolean) => void", description: "Fired when the toggle changes." },
    { name: "contentId", type: "string", description: "Stable id for the collapsible region (aria-controls); auto-generated otherwise." },
    { name: "description", type: "ReactNode", description: "Optional faint sub-label under the title." },
    { name: "titleHref", type: "string", description: "Makes the title a next/link to this href." },
    { name: "onTitleClick", type: "() => void", description: "Makes the title a button (used when no titleHref)." },
    { name: "onIconClick", type: "() => void", description: "Makes the icon an action button (e.g. copy list)." },
    { name: "iconActionLabel", type: "string", description: "Accessible label for the icon action button." },
    { name: "iconActiveState", type: "boolean", default: "false", description: "Swaps the icon for a green check (e.g. \"copied\" feedback)." },
    { name: "toggleLabel", type: "string", description: "Override for the expand/collapse button aria-label." },
    { name: "tone", type: '"default" | "dim"', default: '"default"', description: '"dim" uses a neutral grey panel instead of the purple index surface.' },
    { name: "hideIcon", type: "boolean", default: "false", description: "Drops the leading icon; count rides inline with the title." },
    { name: "IndexCardSection.id", type: "string", description: "Anchor id when the section is a link or contents destination." },
    { name: "IndexCardListItem.meta", type: "ReactNode", description: "Quiet trailing qualifier on a row, e.g. \"(common)\"." },
    { name: "IndexCardListItem.depth", type: "0 | 1", default: "0", description: "1 indents the row with a hollow bullet, marking it as a sub-item of the row above." },
  ],
  whenToUse: [
    "Collapsible category panels on the Substance and Effect index pages.",
    "Any counted, expandable list grouping that should match index-page chrome.",
  ],
  whenNotToUse: [
    "Non-collapsible content cards — reach for ContentCard / Surface recipes instead.",
    "Prose sections in an article body — this is index chrome, not prose layout. The exception is index content that happens to sit inside an article: the Effect Index intensity-scale articles embed effect roundups, and those are the same panel.",
  ],
  notes: [
    "Built on InteractiveSurface (variant=\"index\"); tone=\"dim\" switches to the indexDim surface variant.",
    "Works controlled (expanded + onExpandedChange) or uncontrolled (defaultExpanded).",
    "Pairs with the sibling IndexCardSection / IndexCardList / IndexCardListItem helpers from the same module for body content.",
  ],
};
