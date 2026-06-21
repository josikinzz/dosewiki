import { HighlightedText } from "@/components/common/HighlightedText";

import type { StoryDef } from "../registry/types";

export const highlightedTextStory: StoryDef = {
  id: "highlighted-text",
  name: "HighlightedText",
  tier: "common",
  status: "stable",
  summary:
    "Renders a text string with query terms wrapped in <mark>, used to highlight search matches in result titles and snippets.",
  source: "src/components/common/HighlightedText.tsx",
  importLine: 'import { HighlightedText } from "@/components/common/HighlightedText";',
  exports: ["HighlightedText"],
  examples: [
    {
      label: "Single term",
      note: "Each occurrence of the query term is wrapped in a highlighted <mark>.",
      render: () => (
        <span className="text-sm text-[var(--theme-text-primary)]">
          <HighlightedText
            text="Lysergic acid diethylamide is a classic psychedelic."
            query="acid"
          />
        </span>
      ),
    },
    {
      label: "Multiple terms",
      note: "Whitespace splits the query into terms; every distinct term is matched independently.",
      render: () => (
        <span className="text-sm text-[var(--theme-text-primary)]">
          <HighlightedText
            text="Common stimulant effects include increased focus and elevated energy."
            query="focus energy"
          />
        </span>
      ),
    },
    {
      label: "Case-insensitive matching",
      note: "Matching ignores case but preserves the original casing of the source text.",
      render: () => (
        <span className="text-sm text-[var(--theme-text-primary)]">
          <HighlightedText
            text="MDMA is sometimes called Molly or mdma."
            query="mdma"
          />
        </span>
      ),
    },
    {
      label: "No match / short query",
      note: "Terms of one character or less are ignored; with no usable terms the plain text renders unchanged.",
      render: () => (
        <div className="flex flex-col gap-2 text-sm text-[var(--theme-text-primary)]">
          <HighlightedText
            text="Ketamine is a dissociative anaesthetic."
            query="psilocybin"
          />
          <HighlightedText
            text="Single-character queries are skipped entirely."
            query="a"
          />
        </div>
      ),
    },
    {
      label: "On a card surface",
      note: "How a highlighted result snippet reads against a card background.",
      background: "card",
      render: () => (
        <span className="text-sm text-[var(--theme-text-secondary)]">
          <HighlightedText
            text="Search results highlight the query inline within each snippet."
            query="query highlight"
          />
        </span>
      ),
    },
    {
      label: "Custom mark class",
      note: "markClassName extends the highlight styling; here the matches render bold.",
      render: () => (
        <span className="text-sm text-[var(--theme-text-primary)]">
          <HighlightedText
            text="Override the mark styling without losing the token-driven background."
            query="mark styling"
            markClassName="font-semibold"
          />
        </span>
      ),
    },
  ],
  props: [
    { name: "text", type: "string", description: "The source string to render and search within." },
    {
      name: "query",
      type: "string",
      description: "Whitespace-separated search terms; terms of length 1 or less are ignored.",
    },
    { name: "className", type: "string", description: "Classes applied to the wrapping <span>." },
    {
      name: "markClassName",
      type: "string",
      description: "Extra classes merged onto each <mark>, layered over the default highlight tokens.",
    },
  ],
  whenToUse: [
    "Highlighting matched query terms in search result titles or snippets.",
    "Any list where you want to show why a row matched the user's search.",
  ],
  whenNotToUse: [
    "Rich-text or HTML content — this renders plain string segments only.",
    "Highlighting structural emphasis unrelated to a search query — use semantic markup instead.",
  ],
  notes: [
    "Query terms are regex-escaped before matching, so punctuation in the query is safe.",
    "Duplicate terms are de-duplicated; matching is case-insensitive while the original text casing is preserved.",
    "Highlight colours come from --theme-search-highlight-bg and --theme-search-highlight-text tokens.",
  ],
};
