import { SearchEmptyState } from "@/components/common/SearchEmptyState";

import type { StoryDef } from "../registry/types";

export const searchEmptyStateStory: StoryDef = {
  id: "search-empty-state",
  name: "SearchEmptyState",
  tier: "common",
  status: "stable",
  summary:
    "Centered icon + title + description stack for search panel states (empty / loading / no results). Render it inside the page's theme-public-card panel.",
  source: "src/components/common/SearchEmptyState.tsx",
  importLine: 'import { SearchEmptyState } from "@/components/common/SearchEmptyState";',
  exports: ["SearchEmptyState"],
  examples: [
    {
      label: "Empty (prompt)",
      background: "card",
      note: "Default heading is h1; render inside the search results panel.",
      render: () => (
        <SearchEmptyState
          icon="lucide:search"
          title="Search dose.wiki"
          description="Start typing in the header to find substances, effects, reports, and profiles."
        />
      ),
    },
    {
      label: "Loading",
      background: "card",
      render: () => (
        <SearchEmptyState
          icon="lucide:search"
          title="Searching"
          description="Checking substances, effects, reports, and profiles."
        />
      ),
    },
    {
      label: "No matches",
      background: "card",
      render: () => (
        <SearchEmptyState
          icon="lucide:search-x"
          title="No matches found"
          description="Try another spelling, search for a broader class, or jump into the public indexes instead."
        />
      ),
    },
    {
      label: "Without description",
      background: "card",
      note: "Description is optional; the secondary paragraph is omitted.",
      render: () => <SearchEmptyState icon="lucide:search" title="No results" />,
    },
  ],
  props: [
    {
      name: "icon",
      type: "IconName (string)",
      description: "Iconify name for the centered glyph (lucide:* or custom:*).",
    },
    {
      name: "title",
      type: "ReactNode",
      description: "Headline copy, rendered inside the heading element.",
    },
    {
      name: "description",
      type: "ReactNode",
      description: "Optional supporting copy; omitted when not provided.",
    },
    {
      name: "headingLevel",
      type: '"h1" | "h2" | "h3"',
      default: '"h1"',
      description: "Heading element for the title.",
    },
    {
      name: "iconSize",
      type: "number",
      default: "20",
      description: "Pixel size for the centered icon.",
    },
    {
      name: "className",
      type: "string",
      description: "Extra classes merged onto the centered flex stack (e.g. padding overrides).",
    },
  ],
  whenToUse: [
    "Search result panel states: empty prompt, loading, and no-results.",
    "Any centered icon + title + secondary message inside a search/results surface.",
  ],
  whenNotToUse: [
    "Full-page empty states with card chrome — use EmptyStateSurface / StatusState.",
    "Standalone status stacks: use StateCard.",
  ],
  notes: [
    "Owns only the inner stack; wrap it in the call site's theme-public-card panel for chrome.",
    "Color comes from theme-search-suggestion-* tokens; light/dark are handled automatically.",
  ],
};
