import type { ReviewViewMode } from "./reviewSettings";
import type { ReviewFlagSeverity } from "@/schema/substance/editorial";

const REVIEW_BASE_PATH = "/review";

const REVIEW_VIEW_PARAM = "view";

export interface ReviewLocation {
  slug: string | null;
  view: ReviewViewMode | null;
  flagLabels?: string[];
  flagSeverity?: ReviewFlagSeverity | null;
  flagGroupBy?: "none" | "severity" | "label";
  changedSinceReview?: boolean;
}

const REVIEW_CHANGED_PARAM = "changed";

export interface ReviewHistoryState {
  review: {
    slug: string;
    view: ReviewViewMode;
    index: number;
  };
}

export interface ReviewHistoryEntry extends ReviewLocation {
  slug: string;
  index: number | null;
}

const PARSE_BASE = "http://review.local";

function isViewMode(value: unknown): value is ReviewViewMode {
  return value === "webpage" || value === "editor";
}

export function buildReviewUrl(location: {
  slug: string | null;
  view?: ReviewViewMode | null;
  flagLabels?: readonly string[];
  flagSeverity?: ReviewFlagSeverity | null;
  flagGroupBy?: "none" | "severity" | "label";
  changedSinceReview?: boolean;
}): string {
  const slug = location.slug?.trim();
  const path = slug ? `${REVIEW_BASE_PATH}/${encodeURIComponent(slug)}` : REVIEW_BASE_PATH;
  const params = new URLSearchParams();
  if (location.view) params.set(REVIEW_VIEW_PARAM, location.view);
  location.flagLabels?.forEach((label) => params.append("flag", label));
  if (location.flagSeverity) params.set("severity", location.flagSeverity);
  if (location.flagGroupBy && location.flagGroupBy !== "none") params.set("flagGroup", location.flagGroupBy);
  if (location.changedSinceReview) params.set(REVIEW_CHANGED_PARAM, "1");
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function parseReviewLocation(input: string): ReviewLocation {
  let url: URL;
  try {
    url = new URL(input, PARSE_BASE);
  } catch {
    return { slug: null, view: null };
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] !== "review") {
    return { slug: null, view: null };
  }

  let slug: string | null = null;
  if (segments[1]) {
    try {
      slug = decodeURIComponent(segments[1]);
    } catch {
      slug = segments[1];
    }
  }

  const rawView = url.searchParams.get(REVIEW_VIEW_PARAM);
  const flagLabels = url.searchParams.getAll("flag").filter(Boolean);
  const rawSeverity = url.searchParams.get("severity");
  const rawGroup = url.searchParams.get("flagGroup");
  return {
    slug,
    view: isViewMode(rawView) ? rawView : null,
    ...(flagLabels.length ? { flagLabels } : {}),
    ...(rawSeverity === "major" || rawSeverity === "minor" || rawSeverity === "note" ? { flagSeverity: rawSeverity } : {}),
    ...(rawGroup === "severity" || rawGroup === "label" ? { flagGroupBy: rawGroup } : {}),
    ...(url.searchParams.get(REVIEW_CHANGED_PARAM) === "1" ? { changedSinceReview: true } : {}),
  };
}

export function buildReviewHistoryState(location: {
  slug: string;
  view: ReviewViewMode;
  index: number;
}): ReviewHistoryState {
  return {
    review: { slug: location.slug, view: location.view, index: location.index },
  };
}

export function readReviewHistoryState(state: unknown): ReviewHistoryEntry | null {
  if (!state || typeof state !== "object") return null;
  const candidate = (state as { review?: unknown }).review;
  if (!candidate || typeof candidate !== "object") return null;
  const { slug, view, index } = candidate as {
    slug?: unknown;
    view?: unknown;
    index?: unknown;
  };
  if (typeof slug !== "string" || slug.length === 0) return null;
  return {
    slug,
    view: isViewMode(view) ? view : null,
    index: typeof index === "number" && Number.isFinite(index) ? index : null,
  };
}

export function resolveTraversedLocation(
  state: unknown,
  url: string,
): { slug: string | null; view: ReviewViewMode; index: number | null } {
  const fromState = readReviewHistoryState(state);
  const fromUrl = parseReviewLocation(url);
  return {
    slug: fromState?.slug ?? fromUrl.slug,
    view: fromState?.view ?? fromUrl.view ?? "webpage",
    index: fromState?.index ?? null,
  };
}

export function resolveInitialView(
  urlView: ReviewViewMode | null,
  storedView: ReviewViewMode,
): ReviewViewMode {
  return urlView ?? storedView;
}

export function resolveSeedLocation(
  historyState: unknown,
  url: string,
  fallback: { slug: string; view: ReviewViewMode },
): { slug: string; view: ReviewViewMode; index: number; adopted: boolean } {
  const entry = readReviewHistoryState(historyState);
  if (!entry) {
    return { slug: fallback.slug, view: fallback.view, index: 0, adopted: false };
  }
  return {
    slug: entry.slug,
    view: entry.view ?? parseReviewLocation(url).view ?? fallback.view,
    index: entry.index ?? 0,
    adopted: true,
  };
}
