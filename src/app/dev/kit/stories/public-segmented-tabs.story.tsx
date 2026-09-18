import { PublicSegmentedTabs } from "@/components/layout/PublicSegmentedTabs";

import type { StoryDef } from "../registry/types";

export const publicSegmentedTabsStory: StoryDef = {
  id: "public-segmented-tabs",
  name: "PublicSegmentedTabs",
  tier: "layout",
  status: "stable",
  summary:
    "Shared pill-style segmented control for public index pages — the single 'pick one of N views' tab object used across substance, effects, and report indexes.",
  source: "src/components/layout/PublicSegmentedTabs.tsx",
  importLine:
    'import { PublicSegmentedTabs } from "@/components/layout/PublicSegmentedTabs";',
  exports: ["PublicSegmentedTabs"],
  examples: [
    {
      label: "Basic segmented tabs",
      note: "Controlled control — the active item is whatever matches `value`.",
      background: "card",
      render: () => (
        <PublicSegmentedTabs
          ariaLabel="View"
          value="all"
          items={[
            { id: "all", icon: "lucide:layout-grid", label: "All" },
            { id: "common", icon: "lucide:star", label: "Common" },
            { id: "rare", icon: "lucide:flask-conical", label: "Rare" },
          ]}
        />
      ),
    },
    {
      label: "Without icons",
      note: "Icons are optional; labels stand alone for terse controls.",
      background: "card",
      render: () => (
        <PublicSegmentedTabs
          ariaLabel="Sort"
          value="name"
          items={[
            { id: "name", label: "Name" },
            { id: "recent", label: "Recent" },
            { id: "popular", label: "Popular" },
          ]}
        />
      ),
    },
    {
      label: "Suffix counts",
      note: "The `suffix` slot trails the label with a count or badge.",
      background: "card",
      render: () => (
        <PublicSegmentedTabs
          ariaLabel="Category"
          value="psychedelics"
          items={[
            { id: "psychedelics", icon: "lucide:sparkles", label: "Psychedelics", suffix: "42" },
            { id: "stimulants", icon: "lucide:zap", label: "Stimulants", suffix: "18" },
            { id: "depressants", icon: "lucide:moon", label: "Depressants", suffix: "27" },
          ]}
        />
      ),
    },
    {
      label: "Major prominence",
      note: "`prominence: 'major'` renders bolder labels for overarching tabs at the same height as the rest.",
      background: "card",
      render: () => (
        <PublicSegmentedTabs
          ariaLabel="Section"
          value="substances"
          items={[
            { id: "substances", icon: "lucide:pill", label: "Substances", prominence: "major" },
            { id: "effects", icon: "lucide:brain", label: "Effects", prominence: "major" },
            { id: "reports", icon: "lucide:book-open", label: "Reports", prominence: "major" },
          ]}
        />
      ),
    },
    {
      label: "Disabled item",
      note: "`disabled` forwards to the Radix trigger — dimmed and non-interactive.",
      background: "card",
      render: () => (
        <PublicSegmentedTabs
          ariaLabel="Tab"
          value="overview"
          items={[
            { id: "overview", icon: "lucide:eye", label: "Overview" },
            { id: "saved", icon: "lucide:bookmark", label: "Saved" },
            { id: "profile", icon: "lucide:user", label: "Profile", disabled: true },
          ]}
        />
      ),
    },
    {
      label: "Forced row break",
      note: "`breakAfter` pushes the following items onto a new flex line.",
      background: "card",
      full: true,
      render: () => (
        <PublicSegmentedTabs
          ariaLabel="Filter"
          value="alpha"
          items={[
            { id: "alpha", label: "Alpha" },
            { id: "beta", label: "Beta" },
            { id: "gamma", label: "Gamma", breakAfter: true },
            { id: "delta", label: "Delta" },
            { id: "epsilon", label: "Epsilon" },
          ]}
        />
      ),
    },
    {
      label: "Mobile app grid",
      note: "`mobileVariant=\"appGrid\"` collapses to a grid of app-style icon tiles below `sm` (the shared substance/effects index treatment) and returns to the pill row from `sm` up. Narrow the viewport to see the grid.",
      background: "card",
      full: true,
      render: () => (
        <PublicSegmentedTabs
          ariaLabel="Class"
          value="all"
          mobileVariant="appGrid"
          listClassName="justify-center"
          items={[
            { id: "all", icon: "lucide:layout-grid", label: "All", prominence: "major" },
            { id: "psychedelic", icon: "lucide:sparkles", label: "Psychedelic" },
            { id: "stimulant", icon: "lucide:zap", label: "Stimulant" },
            { id: "depressant", icon: "lucide:moon", label: "Depressant" },
            { id: "opioid", icon: "lucide:pill", label: "Opioid" },
            { id: "cannabinoid", icon: "lucide:leaf", label: "Cannabinoid" },
          ]}
        />
      ),
    },
  ],
  props: [
    {
      name: "value",
      type: "TValue",
      description: "Controlled active item id. Required — match it against the chosen item's id.",
    },
    {
      name: "items",
      type: "PublicSegmentedTabItem<TValue>[]",
      description:
        "Tabs to render. Each item has id, label, and optional icon, suffix, disabled, prominence, breakAfter.",
    },
    {
      name: "ariaLabel",
      type: "string",
      description: "Accessible label applied to the underlying TabsList.",
    },
    {
      name: "onValueChange",
      type: "(value: TValue) => void",
      description: "Fires with the next item id when a tab is activated.",
    },
    {
      name: "onItemSelect",
      type: "(item: PublicSegmentedTabItem<TValue>, meta: { wasActive: boolean }) => void",
      description:
        "Fires with the full item object on click; complements onValueChange. `meta.wasActive` reports whether the tab was already active before the click (re-click vs switch).",
    },
    {
      name: "className",
      type: "string",
      description: "Classes for the outer Tabs wrapper (centered flex by default).",
    },
    {
      name: "listClassName",
      type: "string",
      description: "Classes merged onto the TabsList for layout overrides.",
    },
    {
      name: "mobileVariant",
      type: '"default" | "appGrid"',
      description:
        '"appGrid" renders an app-style icon grid below `sm` and the pill row from `sm` up — the shared substance/effects index control. Defaults to "default".',
    },
    {
      name: "mobileClassName",
      type: "string",
      description:
        "Classes for the mobile app-grid wrapper (e.g. a negative top margin to seat it under a page header). Only used when mobileVariant=\"appGrid\".",
    },
  ],
  whenToUse: [
    "Any public 'pick one of N views' control on an index page (substances, effects, reports).",
    "Filter or sort toggles that should match the site's route-tab pill styling.",
  ],
  whenNotToUse: [
    "Navigation between distinct pages — use links, not tab state.",
    "Dev editor chrome with bespoke behavior beyond the shared item contract.",
  ],
  notes: [
    "Controlled only — it holds no internal state. Drive `value` from your own state and update it in onValueChange.",
    "Built on the shared Radix Tabs primitive (src/components/ui/tabs.tsx), so the same keyboard semantics apply.",
    "Generic over TValue, so item ids can be a narrow string union for type-safe handlers.",
  ],
};
