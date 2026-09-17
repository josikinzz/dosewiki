import { ExpandableList, ExpandableText } from "@/components/common/ArticleExpandable";

import type { StoryDef } from "../registry/types";

const EFFECTS = [
  "Euphoria",
  "Stimulation",
  "Focus enhancement",
  "Increased music appreciation",
  "Time distortion",
  "Tactile enhancement",
  "Anxiety suppression",
  "Thought acceleration",
];

const SAMPLE_PARAGRAPH =
  "Subjective effects are typically described across a range of cognitive, physical, and visual dimensions. " +
  "At common doses users report mild stimulation and mood elevation, with stronger doses introducing more " +
  "pronounced perceptual changes, increased introspection, and a heightened sense of connection. The duration " +
  "and intensity of each effect vary substantially with dose, set, setting, and individual tolerance, so the " +
  "following description should be read as an aggregate sketch rather than a guarantee of any specific experience.";

export const articleExpandableStory: StoryDef = {
  id: "article-expandable",
  name: "Article expandables",
  tier: "common",
  status: "stable",
  summary:
    "Show-more/show-less recipes for article bodies: ExpandableList truncates a list to a few items, ExpandableText line-clamps long copy. Both reuse ExpandButton and wire up aria-expanded/aria-controls.",
  source: "src/components/common/ArticleExpandable.tsx",
  importLine:
    'import { ExpandableList, ExpandableText } from "@/components/common/ArticleExpandable";',
  exports: ["ExpandableList", "ExpandableText"],
  intents: [
    { family: "expand", need: "A whole section's text or list that opens in place", policy: "#expand-affordance-policy" },
  ],
  examples: [
    {
      label: "ExpandableList — renderItem",
      note: "collapsedCount hides the tail; the count toggle reveals the rest.",
      background: "card",
      render: () => (
        <ExpandableList
          ariaLabelBase="subjective effects"
          items={EFFECTS}
          collapsedCount={5}
          listType="ul"
          renderItem={(effect) => (
            <span className="text-sm text-[var(--theme-text-secondary)]">{effect}</span>
          )}
        />
      ),
    },
    {
      label: "ExpandableList — custom children render",
      note: "The children render-prop receives list state for fully custom layouts.",
      background: "card",
      render: () => (
        <ExpandableList
          ariaLabelBase="related compounds"
          items={EFFECTS}
          collapsedCount={4}
        >
          {(state) => (
            <div className="flex flex-wrap gap-2">
              {state.items.map((item) => (
                <span
                  key={item}
                  className="rounded-full bg-[var(--theme-surface-subtle)] px-3 py-1 text-xs text-[var(--theme-text-secondary)]"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </ExpandableList>
      ),
    },
    {
      label: "ExpandableList — collapsed toggle content",
      note: "collapsedToggleContent labels the +N toggle; defaultExpanded starts open.",
      background: "card",
      render: () => (
        <ExpandableList
          ariaLabelBase="contraindications"
          items={EFFECTS}
          collapsedCount={6}
          collapsedToggleContent="more effects"
          renderItem={(effect, index) => (
            <span className="text-sm text-[var(--theme-text-secondary)]">
              {index + 1}. {effect}
            </span>
          )}
        />
      ),
    },
    {
      label: "ExpandableText",
      note: "Line-clamps to maxLines until expanded; toggle sits below the copy.",
      background: "card",
      render: () => (
        <ExpandableText ariaLabelBase="effects summary" maxLines={3}>
          {SAMPLE_PARAGRAPH}
        </ExpandableText>
      ),
    },
    {
      label: "ExpandableText — expanded by default",
      note: "defaultExpanded renders the full body up front; toggle collapses it.",
      background: "card",
      render: () => (
        <ExpandableText ariaLabelBase="pharmacology notes" defaultExpanded maxLines={2}>
          {SAMPLE_PARAGRAPH}
        </ExpandableText>
      ),
    },
  ],
  props: [
    {
      name: "ariaLabelBase",
      type: "string",
      description:
        "Required on both. Phrasing appended after Expand/Collapse for the toggle's aria-label.",
    },
    {
      name: "items (ExpandableList)",
      type: "readonly T[]",
      description: "Full data set; rendered via renderItem or the children render-prop.",
    },
    {
      name: "collapsedCount (ExpandableList)",
      type: "number",
      description: "How many trailing items to hide while collapsed; drives the +N toggle count.",
    },
    {
      name: "visibleItems (ExpandableList)",
      type: "readonly T[]",
      description: "Alternative to collapsedCount — supply the exact collapsed slice yourself.",
    },
    {
      name: "renderItem / children (ExpandableList)",
      type: "(item, index, state) => ReactNode / (state) => ReactNode",
      description: "Use renderItem for ol/ul rows, or children for a fully custom collapsed body.",
    },
    {
      name: "listType (ExpandableList)",
      type: '"ol" | "ul"',
      default: '"ol"',
      description: "Element used to wrap renderItem rows.",
    },
    {
      name: "children (ExpandableText)",
      type: "ReactNode",
      description: "The long-form body that gets line-clamped while collapsed.",
    },
    {
      name: "maxLines (ExpandableText)",
      type: "number",
      default: "4",
      description: "Collapsed line-clamp height via -webkit-line-clamp.",
    },
    {
      name: "defaultExpanded",
      type: "boolean",
      default: "false",
      description: "Start expanded on both components.",
    },
  ],
  whenToUse: [
    "Truncating long article lists (effects, interactions, references) behind a +N toggle.",
    "Line-clamping multi-paragraph article copy with a show-more affordance.",
  ],
  whenNotToUse: [
    "Generic disclosure panels with a heading — use an Accordion/Collapsible primitive.",
    "Short lists that already fit — collapsing nothing just adds a dead toggle.",
  ],
  notes: [
    "Both manage their own open/closed state and stay self-contained.",
    "The toggle is the shared ExpandButton (count variant for lists), so styling stays consistent across articles.",
    "ExpandableText clamps with -webkit-line-clamp, so the collapsed height is line-based, not item-count based.",
  ],
};
