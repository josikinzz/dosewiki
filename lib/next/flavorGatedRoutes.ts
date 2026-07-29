/**
 * Request-time gating for flavor-only routes.
 *
 * `requireEffectIndexFlavor()` inside a page raises Next's not-found, which renders the
 * correct body — but a page that is *statically prerendered* bakes that body into a
 * plain 200 response: Next only records `"status": 404` in a route's `.meta` for the
 * `_not-found` entry itself, so `/blog` on a dose.wiki build served a soft 404. A soft
 * 404 is indexable, so the route the publication does not own would rank.
 *
 * Gating in middleware fixes the status at its source: the request is rewritten to a
 * path no route matches, and Next answers an unmatched path with the global not-found
 * page at a real 404. The in-page guard stays as the second line of defence (and is what
 * keeps a Convex read from being issued for a route this flavor does not serve).
 */
import {
  SITE_FLAVOR_CONFIG,
  isFlavorRouteEnabled,
  type FlavorGatedRoute,
  type SiteFlavorConfig,
} from "@/config/siteFlavor";

/**
 * URL prefixes owned by a flavor-gated route. Only routes that exist as app entries need
 * an entry here; a path with no route already 404s on its own.
 */
const FLAVOR_GATED_ROUTE_PREFIXES: readonly { route: FlavorGatedRoute; prefix: string }[] = [
  { route: "blog", prefix: "/blog" },
  { route: "donate", prefix: "/donate" },
  { route: "contact", prefix: "/contact" },
  { route: "discord", prefix: "/discord" },
  { route: "copyrightDisclaimer", prefix: "/copyright-disclaimer" },
];

/**
 * A deliberately unroutable path. Two segments on purpose: the app has a single-segment
 * catch-all (`src/app/[slug]`), so a one-segment target would be captured by it.
 */
export const FLAVOR_GATED_NOT_FOUND_PATH = "/_flavor-gated/not-found";

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** `true` when this build's flavor does not own the route the path belongs to. */
export function isFlavorGatedRequestPath(
  pathname: string,
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
): boolean {
  return FLAVOR_GATED_ROUTE_PREFIXES.some(
    ({ route, prefix }) => matchesPrefix(pathname, prefix) && !isFlavorRouteEnabled(route, config),
  );
}
