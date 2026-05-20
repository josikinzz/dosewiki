export type LoadingRouteFamily = "page" | "substance" | "category" | "effect" | "report" | "search";

export type RouteLoadingDensity = "compact" | "normal" | "spacious";

export type SkeletonBlock = {
  width: string;
  height: string;
  tone?: "strong" | "soft";
};

export type RouteLoadingSection = {
  key: string;
  variant: "card" | "list" | "article" | "section";
  columns?: 1 | 2;
  blocks: SkeletonBlock[];
};

export type RouteLoadingLandmark = {
  id: string;
  role: "main" | "section";
  ariaBusy: true;
  ariaLive: "polite";
  focusTarget: boolean;
};

export type RouteLoadingViewModel = {
  family: LoadingRouteFamily;
  label: string;
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
  report: "Loading trip report route",
  search: "Loading search results",
} as const satisfies Record<LoadingRouteFamily, string>;

export function getRouteLoadingLabel(family: LoadingRouteFamily): string {
  return routeLoadingLabels[family];
}

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
  report: [
    { key: "report-meta", variant: "card", columns: 2, blocks: [sectionTitle("w-1/3"), textLine("w-4/5"), textLine("w-2/3")] },
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
  report: "spacious",
  search: "compact",
} as const satisfies Record<LoadingRouteFamily, RouteLoadingDensity>;

export function getRouteLoadingModel(family: LoadingRouteFamily): RouteLoadingViewModel {
  return {
    family,
    label: getRouteLoadingLabel(family),
    density: routeLoadingDensity[family],
    landmark: {
      id: "main-content",
      role: "main",
      ariaBusy: true,
      ariaLive: "polite",
      focusTarget: true,
    },
    headingBlocks: [titleLine(family === "search" ? "w-1/2" : "w-2/3"), textLine("w-full"), textLine("w-5/6")],
    sections: [...routeLoadingSections[family]],
  };
}

export function getSectionLoadingModel(input: {
  key: string;
  label: string;
  variant?: RouteLoadingSection["variant"];
  density?: RouteLoadingDensity;
}): RouteLoadingViewModel {
  return {
    family: "page",
    label: input.label,
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
