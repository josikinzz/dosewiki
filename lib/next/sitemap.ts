import "server-only";

import type { MetadataRoute } from "next";
import {
  getPublicRoutePlan,
  getPublicRouteSitemapPaths,
} from "./publicRoutePlan";
import { buildPublicSitemapEntry, PUBLIC_SITE, type PublicSiteIdentity } from "./publicSite";
import {
  getPublicEffectIndexPosts,
  getPublishedEffectIndexArticles,
} from "@server/data/publicData";
import {
  isEffectIndex,
  isFlavorRouteEnabled,
  SITE_FLAVOR_CONFIG,
  type FlavorGatedRoute,
  type SiteFlavorConfig,
} from "../../src/config/siteFlavor";
import {
  getPublicRoutePath,
  type PublicRouteIdentity,
} from "../../src/utils/publicRouteIdentity";



/**
 * Flavor-gated routes with no data behind them: one route id, one fixed path. Paired here
 * so a new supporting page cannot be added to one list and forgotten in the other.
 */
const FLAVOR_GATED_STATIC_ROUTES = [
  { route: "donate", family: "donate" },
  { route: "contact", family: "contact" },
  { route: "discord", family: "discord" },
  { route: "copyrightDisclaimer", family: "copyrightDisclaimer" },
] as const satisfies readonly {
  route: FlavorGatedRoute;
  family: Extract<
    PublicRouteIdentity,
    { family: "donate" | "contact" | "discord" | "copyrightDisclaimer" }
  >["family"];
}[];

/** Everything the flavor branch needs, so the branch itself stays a pure function. */
export type FlavorGatedSitemapInput = {
  /** Slugs of the archived Effect Index blog posts. */
  blogPostSlugs: readonly string[];
};

/**
 * The sitemap's flavor branch: paths that exist on some publications only.
 *
 * These deliberately do not live in `STATIC_PUBLIC_PATHS` or in the route plan's
 * families — putting them there would list them on the dose.wiki build too, where the
 * routes 404. Each group is gated on the same {@link isFlavorRouteEnabled} predicate the
 * pages themselves are guarded with, so a route cannot be advertised without being served.
 *
 * Pure and config-injected: pass a `SiteFlavorConfig` to reach the other flavor's answer
 * without touching `process.env`.
 */
export function buildFlavorGatedSitemapPaths(
  input: FlavorGatedSitemapInput,
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
): string[] {
  const paths: string[] = [];

  if (isFlavorRouteEnabled("blog", config)) {
    paths.push(getPublicRoutePath({ family: "blog" }));

    for (const slug of input.blogPostSlugs) {
      if (slug) {
        paths.push(getPublicRoutePath({ family: "blogPost", params: { slug } }));
      }
    }
  }

  // The four static supporting pages. Each is gated on its own route id rather than on
  // "is this Effect Index", so enabling one on a future flavor lists exactly that one.
  for (const { route, family } of FLAVOR_GATED_STATIC_ROUTES) {
    if (isFlavorRouteEnabled(route, config)) {
      paths.push(getPublicRoutePath({ family }));
    }
  }

  // The documentation house style is gated on the flavor itself rather than on a route id —
  // see EFFECT_INDEX_ONLY_ROUTE_PREFIXES in ./flavorGatedRoutes.ts for why. Same predicate
  // the page's own guard uses, so it cannot be advertised without being served.
  if (isEffectIndex(config)) {
    paths.push(getPublicRoutePath({ family: "documentationStyleGuide" }));
  }

  return paths;
}

/**
 * Read only what the active flavor's gated routes actually need.
 *
 * Both flavors serve `/blog`, but from different corpora, so the read branches
 * the same way the route does: Effect Index sitemaps the frozen archive, and
 * dose.wiki sitemaps its own `kind: "blog"` rows. Neither build ever reads —
 * let alone advertises — the other's posts.
 */
async function loadFlavorGatedSitemapInput(
  config: SiteFlavorConfig,
): Promise<FlavorGatedSitemapInput> {
  if (!isFlavorRouteEnabled("blog", config)) {
    return { blogPostSlugs: [] };
  }

  if (isEffectIndex(config)) {
    const posts = await getPublicEffectIndexPosts();
    return { blogPostSlugs: posts.map((post) => post.slug) };
  }

  const rows = await getPublishedEffectIndexArticles();

  return {
    blogPostSlugs: rows.filter((row) => row.kind === "blog").map((row) => row.slug),
  };
}

export async function buildSitemapEntries(
  site: PublicSiteIdentity = PUBLIC_SITE,
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
): Promise<MetadataRoute.Sitemap> {
  const [plan, flavorInput] = await Promise.all([
    getPublicRoutePlan(),
    loadFlavorGatedSitemapInput(config),
  ]);

  return [
    ...getPublicRouteSitemapPaths(plan),
    ...buildFlavorGatedSitemapPaths(flavorInput, config),
  ].map((pathname) => buildPublicSitemapEntry(pathname, site));
}
