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
 * keeps a Postgres read from being issued for a route this flavor does not serve).
 */
import {
  SITE_FLAVOR_CONFIG,
  isEffectIndex,
  isFlavorRouteEnabled,
  type FlavorGatedRoute,
  type SiteFlavorConfig,
} from "@/config/siteFlavor";

/**
 * URL prefixes owned by a flavor-gated route. Only routes that exist as app entries need
 * an entry here; a path with no route already 404s on its own.
 *
 * `/dev` covers the whole editor shell, `/dev/kit` and `/dev/themes` included: on the
 * flavor that does not list `dev` the request is answered here, before the middleware's
 * session lookup and sign-in redirect further down.
 */
const FLAVOR_GATED_ROUTE_PREFIXES: readonly { route: FlavorGatedRoute; prefix: string }[] = [
  { route: "blog", prefix: "/blog" },
  { route: "donate", prefix: "/donate" },
  { route: "contact", prefix: "/contact" },
  { route: "discord", prefix: "/discord" },
  { route: "copyrightDisclaimer", prefix: "/copyright-disclaimer" },
  { route: "dev", prefix: "/dev" },
];

/**
 * Prefixes owned by Effect Index outright rather than by a named {@link FlavorGatedRoute}.
 *
 * `/documentation-style-guide` is the Effect Index documentation house style, linked from
 * that site's homepage copy and from nowhere on dose.wiki. It is gated on the flavor rather
 * than on a route id because `FlavorGatedRoute` lives in `src/config/siteFlavor.ts`, which
 * this change does not own; a page whose only audience is one publication does not need a
 * per-route switch to be correct, only a correct 404 on the other build.
 */
const EFFECT_INDEX_ONLY_ROUTE_PREFIXES: readonly string[] = ["/documentation-style-guide"];

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
  if (
    FLAVOR_GATED_ROUTE_PREFIXES.some(
      ({ route, prefix }) => matchesPrefix(pathname, prefix) && !isFlavorRouteEnabled(route, config),
    )
  ) {
    return true;
  }

  return (
    !isEffectIndex(config) &&
    EFFECT_INDEX_ONLY_ROUTE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))
  );
}
