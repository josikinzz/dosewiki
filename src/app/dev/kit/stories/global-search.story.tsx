import { GlobalSearch } from "@/components/common/GlobalSearch";
import type { AppView } from "@/types/navigation";

import type { StoryDef } from "../registry/types";

// Inert mock navigation handlers. GlobalSearch only fetches `/api/search-suggestions`
// once the input is focused with a non-empty query, so an idle mounted instance stays
// presentational on the dev page.
const noopNavigate = (_view: AppView) => {};
const homeView: AppView = { type: "home" };

export const globalSearchStory: StoryDef = {
  id: "global-search",
  name: "GlobalSearch",
  tier: "common",
  status: "stable",
  summary:
    "Site-wide search input with live suggestion listbox. One component, three visual shells: default page search, compact header pill, and the large home-hero variant.",
  source: "src/components/common/GlobalSearch.tsx",
  importLine: 'import { GlobalSearch } from "@/components/common/GlobalSearch";',
  exports: ["GlobalSearch"],
  examples: [
    {
      label: "Default",
      note: "Rounded field with a leading magnifier; used on standalone search surfaces.",
      background: "subtle",
      full: true,
      render: () => (
        <GlobalSearch
          currentView={homeView}
          onNavigate={noopNavigate}
          containerClassName="w-full"
          placeholder="Search the library..."
        />
      ),
    },
    {
      label: "Compact header",
      note: "compact pill with a trailing submit button — the form factor in the route header.",
      background: "card",
      full: true,
      render: () => (
        <GlobalSearch
          currentView={homeView}
          onNavigate={noopNavigate}
          containerClassName="w-full"
          compact
          placeholder="Search..."
        />
      ),
    },
    {
      label: "Home hero",
      note: 'variant="home" — the oversized rounded search on the landing hero.',
      background: "subtle",
      full: true,
      render: () => (
        <GlobalSearch
          currentView={homeView}
          onNavigate={noopNavigate}
          containerClassName="w-full"
          variant="home"
          placeholder="Search dose.wiki..."
        />
      ),
    },
  ],
  props: [
    {
      name: "currentView",
      type: "AppView",
      description:
        "Current app route. When it is a search view the input seeds from its query; otherwise the field clears.",
    },
    {
      name: "onNavigate",
      type: "(view: AppView) => void",
      description: "Required. Called when a suggestion is selected or the query is submitted.",
    },
    {
      name: "onReplaceNavigate",
      type: "(view: AppView) => void",
      description: "Optional. Used instead of onNavigate to replace history while editing a live search.",
    },
    {
      name: "onLiveNavigate",
      type: "(view: AppView) => void",
      description: "Optional. Push navigation used when liveResultsMode first enters the search route.",
    },
    {
      name: "variant",
      type: '"default" | "home"',
      default: '"default"',
      description: "Visual shell. home is the oversized landing-hero treatment.",
    },
    {
      name: "compact",
      type: "boolean",
      default: "false",
      description: "Header pill form factor with a trailing submit button (ignored when variant is home).",
    },
    {
      name: "liveResultsMode",
      type: "boolean",
      default: "false",
      description: "Drive a results page live: typing debounces straight into search navigation instead of a listbox.",
    },
    {
      name: "liveSearchClearView",
      type: "AppView | null",
      default: "null",
      description: "Route to return to when clearing a live search.",
    },
    {
      name: "onSearchModeChange",
      type: "(isSearchMode: boolean) => void",
      description: "Optional. Notifies the parent when the field enters or leaves active search mode.",
    },
    { name: "placeholder", type: "string", description: "Override the default placeholder text." },
    { name: "containerClassName", type: "string", description: "Override the outer wrapper width/padding classes." },
  ],
  whenToUse: [
    "The single global search affordance in the header, on a search page, or on the home hero.",
    "Anywhere you need typeahead suggestions across substances, effects, reports, and profiles.",
  ],
  whenNotToUse: [
    "Filtering a local list in place — use a plain Input plus your own filter state.",
    "Forms that submit elsewhere — this component owns navigation via onNavigate.",
  ],
  notes: [
    "Suggestions load lazily from /api/search-suggestions only once the input is focused with a query, so an idle mounted instance makes no network calls.",
    "The compact site-search and home variants portal an overlay panel to document.body when active; the catalog shows the idle field rather than the open overlay.",
    "Pass onReplaceNavigate / onLiveNavigate together with liveResultsMode to wire it as a results-page driver instead of a suggestion box.",
  ],
};
