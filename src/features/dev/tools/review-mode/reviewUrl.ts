import type { ReviewViewMode } from "./reviewSettings";

/**
 * The review workbench's address, in both directions.
 *
 * The workbench flips between articles without routing (see `navigateTo` in
 * `ReviewExperience`): the route is `force-dynamic` and the client re-downloads
 * the whole Convex library on mount, so a `router.push` per article would
 * remount the workbench. That leaves the History API as the only navigation
 * mechanism, and this module is the single place that knows how a workbench
 * position is written into a URL and read back out of one.
 *
 * The view mode rides in a **query parameter**, not the hash. The rendered
 * article owns the hash — `PublicTableOfContents` writes section anchors into
 * it — and a parked `#editor` would both collide with those anchors and, via
 * `useResetScrollOnPathnameChange`, suppress the scroll reset on every flip.
 */

/** The path prefix every workbench address shares. */
export const REVIEW_BASE_PATH = "/review";

/** Query parameter carrying the Webpage / Editor split. */
export const REVIEW_VIEW_PARAM = "view";

/** Where the workbench is, as far as the address bar is concerned. */
export interface ReviewLocation {
  slug: string | null;
  /**
   * `null` means the address said nothing about the view. That is different
   * from "webpage": an unspecified view defers to the stored preference on
   * first load, while an explicit one wins over it.
   */
  view: ReviewViewMode | null;
}

/** The `history.state` payload the workbench writes with each entry. */
export interface ReviewHistoryState {
  review: {
    slug: string;
    view: ReviewViewMode;
    /**
     * Monotonic position in the workbench's own run of entries, counted from
     * the seed entry this session replaced on mount.
     *
     * `popstate` does not say which direction the traverse went, and the
     * workbench needs to know: the in-app ← arrow delegates to
     * `history.back()` only while there is a workbench entry behind the
     * current one, and offering it otherwise would walk the reviewer out of
     * the workbench entirely.
     */
    index: number;
  };
}

/** A workbench position as recorded in `history.state`. */
export interface ReviewHistoryEntry extends ReviewLocation {
  index: number | null;
}

/** Origin used only to make relative paths parseable; never emitted. */
const PARSE_BASE = "http://review.local";

function isViewMode(value: unknown): value is ReviewViewMode {
  return value === "webpage" || value === "editor";
}

/**
 * The address for one workbench position.
 *
 * `webpage` is the default and is left out of the query string, so the common
 * case stays `/review/2c-b` — the address a reviewer would paste into chat.
 */
export function buildReviewUrl(location: {
  slug: string | null;
  view?: ReviewViewMode | null;
}): string {
  const slug = location.slug?.trim();
  const path = slug ? `${REVIEW_BASE_PATH}/${encodeURIComponent(slug)}` : REVIEW_BASE_PATH;
  return location.view === "editor"
    ? `${path}?${REVIEW_VIEW_PARAM}=editor`
    : path;
}

/**
 * Read a workbench position out of a URL or path.
 *
 * Mirrors the route's own parsing: `/review/[[...slug]]` hands the page
 * `slug?.[0]`, so extra path segments are ignored rather than treated as part
 * of the slug. Anything that is not a review address, and any unrecognised
 * `view` value, resolves to "unspecified" rather than throwing.
 */
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
  return { slug, view: isViewMode(rawView) ? rawView : null };
}

/**
 * The `history.state` payload for one workbench position.
 *
 * Next's App Router patches `pushState`/`replaceState` and copies its own
 * internals (`__NA`, the private tree) onto whatever object it is handed, so
 * this payload must be a plain extensible object and readers must tolerate
 * keys they did not write.
 */
export function buildReviewHistoryState(location: {
  slug: string;
  view: ReviewViewMode;
  index: number;
}): ReviewHistoryState {
  return {
    review: { slug: location.slug, view: location.view, index: location.index },
  };
}

/**
 * The workbench position recorded in a `history.state`, if this entry is one
 * of ours. Entries pushed by anything else (or by an older build) return null
 * and the caller falls back to the URL.
 */
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

/**
 * Where a `popstate` landed.
 *
 * The state payload is authoritative because it is the only record that
 * survives a URL whose `view` was omitted for being the default; the URL is the
 * fallback for entries the workbench did not write. A traverse always resolves
 * to a concrete view — there is no stored preference to defer to once the
 * session is running.
 */
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

/**
 * The view the workbench should open in.
 *
 * An explicit `?view=` wins over the stored preference: a shared or bookmarked
 * address is a statement about which view to show, while localStorage is only
 * the reviewer's standing default.
 */
export function resolveInitialView(
  urlView: ReviewViewMode | null,
  storedView: ReviewViewMode,
): ReviewViewMode {
  return urlView ?? storedView;
}

/**
 * True when the address bar already shows this position, so the caller can
 * skip a redundant history write. Guards the popstate handler against pushing
 * an entry for a traverse it merely observed.
 */
export function isSameReviewLocation(
  a: { slug: string | null; view: ReviewViewMode | null },
  b: { slug: string | null; view: ReviewViewMode | null },
): boolean {
  return a.slug === b.slug && (a.view ?? "webpage") === (b.view ?? "webpage");
}
