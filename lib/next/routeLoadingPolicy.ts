import { msg, type Translate } from "@/i18n/messages";

export type LoadingRouteFamily = "page" | "substance" | "category" | "effect" | "mechanism" | "report" | "search";

export type RouteLoadingDensity = "compact" | "normal" | "spacious";

type SkeletonBlock = {
  width: string;
  height: string;
  tone?: "strong" | "soft";
}

export type RouteLoadingSection = {
  key: string;
  variant: "card" | "list" | "article" | "section";
  columns?: 1 | 2;
  blocks: SkeletonBlock[];
};

type RouteLoadingLandmark = {
  id: string;
  role: "main" | "section";
  ariaBusy: true;
  ariaLive: "polite";
  focusTarget: boolean;
}

export type RouteLoadingViewModel = {
  family: LoadingRouteFamily;
  /**
   * `route` models stand in for a whole document; `section` models fill one
   * Suspense hole inside a page that has already rendered. Only the former has
   * to reserve a scrollport. Public routes no longer ship `loading.tsx`
   * boundaries (the header progress bar carries pending navigation instead),
   * so `route` models survive for in-page full-surface holds such as the
   * review workbench boot.
   */
  scope: "route" | "section";
  label: string;
  pendingLabel: string;
  stalledLabel: string;
  density: RouteLoadingDensity;
  landmark: RouteLoadingLandmark;
  headingBlocks: SkeletonBlock[];
  sections: RouteLoadingSection[];
};

export const routeLoadingLabels = {
  page: "Loading page",
  substance: "Loading substance route",
  category: "Loading category route",
  effect: "Loading effect route",
  mechanism: "Loading mechanism route",
  report: "Loading trip report route",
  search: "Loading search results",
} as const satisfies Record<LoadingRouteFamily, string>;

export function getRouteLoadingLabel(family: LoadingRouteFamily): string {
  return routeLoadingLabels[family];
}

const routePendingLabels = {
  page: "Preparing public discovery modules",
  substance: "Fetching article sections and safety context",
  category: "Building category groups and related entries",
  effect: "Loading effect summary and references",
  mechanism: "Loading mechanism qualifiers and related substances",
  report: "Opening trip report content",
  search: "Searching labels, aliases, and metadata",
} as const satisfies Record<LoadingRouteFamily, string>;

const routeStalledLabels = {
  page: "Still loading. If this does not resolve, refresh the page.",
  substance: "Still loading article data. Refresh if this message stays visible.",
  category: "Still loading category results. Refresh if this message stays visible.",
  effect: "Still loading effect details. Refresh if this message stays visible.",
  mechanism: "Still loading mechanism details. Refresh if this message stays visible.",
  report: "Still loading report content. Refresh if this message stays visible.",
  search: "Still searching. Try refreshing if results do not appear.",
} as const satisfies Record<LoadingRouteFamily, string>;

const textLine = (width: string): SkeletonBlock => ({ width, height: "h-4", tone: "soft" });
const titleLine = (width: string): SkeletonBlock => ({ width, height: "h-10", tone: "strong" });
const sectionTitle = (width: string): SkeletonBlock => ({ width, height: "h-5", tone: "strong" });

const sectionBlocks = [sectionTitle("w-1/3"), textLine("w-full"), textLine("w-4/5"), textLine("w-3/5")];
const companionBlocks = [sectionTitle("w-2/5"), textLine("w-full"), textLine("w-5/6"), textLine("w-2/3")];

const routeLoadingSections = {
  page: [
    { key: "primary", variant: "card", columns: 2, blocks: sectionBlocks },
    { key: "secondary", variant: "card", columns: 2, blocks: companionBlocks },
  ],
  substance: [
    { key: "overview", variant: "article", columns: 2, blocks: sectionBlocks },
    { key: "quick-facts", variant: "card", columns: 2, blocks: companionBlocks },
    { key: "effects", variant: "section", columns: 2, blocks: [sectionTitle("w-1/4"), textLine("w-full"), textLine("w-5/6")] },
    { key: "reports", variant: "list", columns: 1, blocks: [sectionTitle("w-1/3"), textLine("w-full"), textLine("w-11/12")] },
  ],
  category: [
    { key: "category-summary", variant: "card", columns: 2, blocks: sectionBlocks },
    { key: "substance-list", variant: "list", columns: 2, blocks: companionBlocks },
    { key: "related", variant: "card", columns: 1, blocks: [sectionTitle("w-1/5"), textLine("w-full"), textLine("w-3/4")] },
  ],
  effect: [
    { key: "effect-summary", variant: "article", columns: 2, blocks: sectionBlocks },
    { key: "effect-taxonomy", variant: "card", columns: 2, blocks: companionBlocks },
    { key: "citations", variant: "section", columns: 1, blocks: [sectionTitle("w-1/4"), textLine("w-full"), textLine("w-2/3")] },
  ],
  mechanism: [
    {
      key: "qualifier-chips",
      variant: "section",
      columns: 1,
      blocks: [
        { width: "w-28", height: "h-8", tone: "strong" },
        { width: "w-36", height: "h-8", tone: "soft" },
        { width: "w-24", height: "h-8", tone: "soft" },
      ],
    },
    { key: "active-qualifier", variant: "card", columns: 2, blocks: sectionBlocks },
    { key: "taxonomy-card-a", variant: "list", columns: 2, blocks: companionBlocks },
    { key: "taxonomy-card-b", variant: "list", columns: 2, blocks: [sectionTitle("w-2/5"), textLine("w-11/12"), textLine("w-2/3")] },
  ],
  report: [
    { key: "report-meta", variant: "card", columns: 1, blocks: [textLine("w-1/2"), textLine("w-3/4")] },
    { key: "report-body", variant: "article", columns: 1, blocks: [sectionTitle("w-1/4"), textLine("w-full"), textLine("w-full"), textLine("w-5/6"), textLine("w-2/3")] },
  ],
  search: [
    { key: "search-result-1", variant: "list", columns: 1, blocks: [sectionTitle("w-1/5"), textLine("w-full"), textLine("w-3/4")] },
    { key: "search-result-2", variant: "list", columns: 1, blocks: [sectionTitle("w-1/4"), textLine("w-11/12"), textLine("w-2/3")] },
    { key: "search-result-3", variant: "list", columns: 1, blocks: [sectionTitle("w-1/6"), textLine("w-4/5"), textLine("w-3/5")] },
  ],
} as const satisfies Record<LoadingRouteFamily, RouteLoadingSection[]>;

const routeLoadingDensity = {
  page: "normal",
  substance: "spacious",
  category: "normal",
  effect: "normal",
  mechanism: "normal",
  report: "spacious",
  search: "compact",
} as const satisfies Record<LoadingRouteFamily, RouteLoadingDensity>;

export function getRouteLoadingModel(family: LoadingRouteFamily): RouteLoadingViewModel {
  return {
    family,
    scope: "route",
    label: getRouteLoadingLabel(family),
    pendingLabel: routePendingLabels[family],
    stalledLabel: routeStalledLabels[family],
    density: routeLoadingDensity[family],
    landmark: {
      id: `loading-${family}`,
      role: "section",
      ariaBusy: true,
      ariaLive: "polite",
      focusTarget: false,
    },
    headingBlocks: [titleLine(family === "search" ? "w-1/2" : "w-2/3"), textLine("w-full"), textLine("w-5/6")],
    sections: [...routeLoadingSections[family]],
  };
}

const SECTION_PENDING_LABEL = msg("Preparing section content");
const SECTION_STALLED_LABEL = msg("Still loading. Refresh if this section does not appear.");

/** `t` translates the fixed labels for a localized page; `label` arrives already translated. */
export function getSectionLoadingModel(
  input: {
    key: string;
    label: string;
    variant?: RouteLoadingSection["variant"];
    density?: RouteLoadingDensity;
  },
  t: Translate = (text) => text,
): RouteLoadingViewModel {
  return {
    family: "page",
    scope: "section",
    label: input.label,
    pendingLabel: t(SECTION_PENDING_LABEL),
    stalledLabel: t(SECTION_STALLED_LABEL),
    density: input.density ?? "compact",
    landmark: {
      id: input.key,
      role: "section",
      ariaBusy: true,
      ariaLive: "polite",
      focusTarget: false,
    },
    headingBlocks: [],
    sections: [
      {
        key: input.key,
        variant: input.variant ?? "section",
        columns: 1,
        blocks: [sectionTitle("w-1/3"), textLine("w-full"), textLine("w-5/6")],
      },
    ],
  };
}
