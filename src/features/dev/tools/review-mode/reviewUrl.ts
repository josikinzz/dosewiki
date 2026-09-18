import type { ReviewViewMode } from "./reviewSettings";
import type { ReviewFlagSeverity } from "@/schema/substance/editorial";

/**
 * The review workbench's address, in both directions.
 *
 * The workbench flips between articles without routing (see `navigateTo` in
 * `ReviewExperience`): the route is `force-dynamic` and the client re-downloads
 * the whole Postgres library on mount, so a `router.push` per article would
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
const REVIEW_BASE_PATH = "/review";

/** Query parameter carrying the Webpage / Editor split. */
const REVIEW_VIEW_PARAM = "view";

/** Where the workbench is, as far as the address bar is concerned. */
export interface ReviewLocation {
  slug: string | null;
  /**
   * `null` means the address said nothing about the view. That is different
   * from "webpage": an unspecified view defers to the stored preference on
   * first load, while an explicit one wins over it.
   */
  view: ReviewViewMode | null;
  flagLabels?: string[];
  flagSeverity?: ReviewFlagSeverity | null;
  flagGroupBy?: "none" | "severity" | "label";
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
     * Neither `popstate` nor the address says how deep the workbench sits, and
     * the counting has to survive a reload or a traverse back in: a session
     * that restarted at 0 would treat the entry it landed on as a first
     * arrival and rewrite it in place rather than pushing behind it.
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
 * Both views are written explicitly, `webpage` included. Leaving the default
 * out kept the common address short but made a workbench URL ambiguous with a
 * hand-typed one: on any remount the silent URL deferred to the stored
 * preference, so a session that had toggled to the editor came back as the
 * editor on an address the workbench itself had written for the webpage — and
 * the seed then rewrote the traversed-to entry to match. An address the
 * workbench wrote always states which view it means.
 *
 * A `null`/absent view still yields the bare path: that is a caller saying
 * nothing about the view, which only external and legacy addresses do.
 */
export function buildReviewUrl(location: {
  slug: string | null;
  view?: ReviewViewMode | null;
  flagLabels?: readonly string[];
  flagSeverity?: ReviewFlagSeverity | null;
  flagGroupBy?: "none" | "severity" | "label";
}): string {
  const slug = location.slug?.trim();
  const path = slug ? `${REVIEW_BASE_PATH}/${encodeURIComponent(slug)}` : REVIEW_BASE_PATH;
  const params = new URLSearchParams();
  if (location.view) params.set(REVIEW_VIEW_PARAM, location.view);
  location.flagLabels?.forEach((label) => params.append("flag", label));
  if (location.flagSeverity) params.set("severity", location.flagSeverity);
  if (location.flagGroupBy && location.flagGroupBy !== "none") params.set("flagGroup", location.flagGroupBy);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
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
  const flagLabels = url.searchParams.getAll("flag").filter(Boolean);
  const rawSeverity = url.searchParams.get("severity");
  const rawGroup = url.searchParams.get("flagGroup");
  return {
    slug,
    view: isViewMode(rawView) ? rawView : null,
    ...(flagLabels.length ? { flagLabels } : {}),
    ...(rawSeverity === "major" || rawSeverity === "minor" || rawSeverity === "note" ? { flagSeverity: rawSeverity } : {}),
    ...(rawGroup === "severity" || rawGroup === "label" ? { flagGroupBy: rawGroup } : {}),
  };
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
 * The state payload is authoritative because it carries the entry's index,
 * which no URL records; the URL is the fallback for entries the workbench did
 * not write, or wrote before it stated the view. A traverse always resolves
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
 * What the workbench should do with the entry it mounted on.
 *
 * Mount is not always a fresh arrival. A reload, a tab discard, or a traverse
 * back into `/review` lands on an entry the workbench itself stamped, complete
 * with its slug, its view, and its position in this run of entries. Overwriting
 * that with a freshly resolved seed was the whole of the second navigation bug:
 * it reset the index to 0 while the browser still held entries behind the
 * current one, so the next flip replaced the entry on screen instead of pushing
 * behind it and the browser's back button had nothing left to traverse to.
 *
 * So an existing entry is *adopted*: the caller restores its position from the
 * payload and leaves the entry alone. Only a mount with no payload of ours —
 * a real first arrival — gets the fallback seed written over it.
 *
 * The URL is consulted only for an adopted entry whose payload predates the
 * view being recorded; the fallback is the caller's already-resolved position.
 */
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
