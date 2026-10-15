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

export type FlavorGatedSitemapInput = {
  blogPostSlugs: readonly string[];
};

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

  for (const { route, family } of FLAVOR_GATED_STATIC_ROUTES) {
    if (isFlavorRouteEnabled(route, config)) {
      paths.push(getPublicRoutePath({ family }));
    }
  }

  if (isEffectIndex(config)) {
    paths.push(getPublicRoutePath({ family: "documentationStyleGuide" }));
  }

  return paths;
}

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
