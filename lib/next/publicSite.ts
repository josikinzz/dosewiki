import type { Metadata, MetadataRoute } from "next";
import {
  buildCanonicalPath,
  getPublicRoutePath,
  type PublicRouteIdentity,
} from "../../src/utils/publicRouteIdentity";
import {
  SITE_FLAVOR_CONFIG,
  type SiteFlavor,
  type SiteFlavorConfig,
  type SiteSocialCard,
} from "../../src/config/siteFlavor";
import { getRequestLocale, t } from "../../src/i18n/requestLocale";
import { resolveLocaleIdentity } from "../../src/i18n/localeRegistry.mjs";

export { buildCanonicalPath, getPublicRoutePath, type PublicRouteIdentity };

export const DEFAULT_PUBLIC_SITE_URL = SITE_FLAVOR_CONFIG.defaultSiteUrl;
export const PUBLIC_LAUNCH_SITE_URL = SITE_FLAVOR_CONFIG.launchSiteUrl;

type PublicSiteEnv = {
  NEXT_PUBLIC_SITE_URL?: string;
};

function normalizeSiteUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/**
 * An explicitly configured `NEXT_PUBLIC_SITE_URL` always wins; otherwise the active
 * flavor's default canonical base is used.
 */
export function getPublicSiteUrl(
  env: PublicSiteEnv = { NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL },
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
): string {
  return normalizeSiteUrl(env.NEXT_PUBLIC_SITE_URL) ?? config.defaultSiteUrl;
}

/** The flavored identity every public metadata surface reads from. */
export type PublicSiteIdentity = {
  flavor: SiteFlavor;
  name: string;
  /** Browser-tab title suffix; `buildPublicPageMetadata` appends " - <suffix>" once. */
  titleSuffix: string;
  url: string;
  description: string;
  logoPath: string;
  socialCard: SiteSocialCard;
};

export function getPublicSite(
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
  env: PublicSiteEnv = { NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL },
): PublicSiteIdentity {
  return {
    flavor: config.flavor,
    name: config.name,
    titleSuffix: config.titleSuffix,
    url: getPublicSiteUrl(env, config),
    description: config.description,
    logoPath: config.logoPath,
    socialCard: config.socialCard,
  };
}

export const PUBLIC_SITE: PublicSiteIdentity = getPublicSite();

const MAX_META_DESCRIPTION_LENGTH = 180;
const MIN_META_DESCRIPTION_LENGTH = 50;

function buildShortDescriptionSuffix(siteName: string): string {
  return ` Explore related ${siteName} records, sources, and route context.`;
}

/**
 * A per-page Open Graph image override (e.g. the substance molecule card).
 * `path` is a site-relative asset or route path; the builder makes it absolute.
 */
type PublicPageSocialImage = {
  path: string;
  width: number;
  height: number;
  alt: string;
};

export type PublicPageMetadataInput = {
  title: string;
  description: string;
  route?: PublicRouteIdentity;
  pathname?: string;
  noIndex?: boolean;
  /** Overrides the flavor-wide social card for this page only. */
  socialImage?: PublicPageSocialImage;
};

export function buildSiteUrl(pathname = "/", site: PublicSiteIdentity = PUBLIC_SITE): string {
  return new URL(buildCanonicalPath(pathname), site.url).toString();
}

export function buildSiteAssetUrl(pathname: string, site: PublicSiteIdentity = PUBLIC_SITE): string {
  return /^https?:\/\//i.test(pathname) ? new URL(pathname).toString() : buildSiteUrl(pathname, site);
}

function buildMetaDescription(description: string, siteName: string): string {
  let normalized = description.replace(/\s+/g, " ").trim();

  if (normalized && normalized.length < MIN_META_DESCRIPTION_LENGTH) {
    normalized = `${normalized.replace(/\.$/, "")}.${buildShortDescriptionSuffix(siteName)}`;
  }

  if (normalized.length <= MAX_META_DESCRIPTION_LENGTH) {
    return normalized;
  }

  const truncated = normalized.slice(0, MAX_META_DESCRIPTION_LENGTH - 3);
  const lastSpaceIndex = truncated.lastIndexOf(" ");
  const snippet = lastSpaceIndex > 100 ? truncated.slice(0, lastSpaceIndex) : truncated;

  return `${snippet.trimEnd()}...`;
}

/**
 * The one owner of the title-suffix convention: routes pass a bare page name and this
 * composes `<name> - <suffix>`. An empty name yields the suffix alone — the homepage's
 * form, which is why it is the only tab title without the trailing " - <suffix>".
 */
/**
 * The page name renders in the request's UI locale: index titles are catalog
 * keys, record names pass through unchanged when the catalog has no entry.
 */
function composePageTitle(title: string, site: PublicSiteIdentity): string {
  const pageName = title.trim();
  return pageName ? `${t(pageName)} - ${site.titleSuffix}` : site.titleSuffix;
}

export function buildPublicPageMetadata(
  { title, description, route, pathname, noIndex = false, socialImage }: PublicPageMetadataInput,
  site: PublicSiteIdentity = PUBLIC_SITE,
): Metadata {
  const canonicalPath = buildCanonicalPath(pathname ?? (route ? getPublicRoutePath(route) : "/"));
  const absoluteUrl = buildSiteUrl(canonicalPath, site);
  const socialCard = socialImage ?? {
    path: site.socialCard.path,
    width: site.socialCard.width,
    height: site.socialCard.height,
    alt: `${site.name} logo`,
  };
  const socialCardUrl = buildSiteAssetUrl(socialCard.path, site);
  const metaDescription = buildMetaDescription(description, site.name);
  const pageTitle = composePageTitle(title, site);

  return {
    title: pageTitle,
    description: metaDescription,
    alternates: {
      canonical: absoluteUrl,
    },
    openGraph: {
      title: pageTitle,
      description: metaDescription,
      url: absoluteUrl,
      siteName: site.name,
      type: "website",
      locale: resolveLocaleIdentity(getRequestLocale()).htmlLanguage,
      images: [
        {
          url: socialCardUrl,
          width: socialCard.width,
          height: socialCard.height,
          alt: socialCard.alt,
        },
      ],
    },
    twitter: {
      card: "summary",
      title: pageTitle,
      description: metaDescription,
      images: [socialCardUrl],
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
        }
      : undefined,
  };
}

export function buildPublicSitemapEntry(
  pathname: string,
  site: PublicSiteIdentity = PUBLIC_SITE,
): MetadataRoute.Sitemap[number] {
  const canonicalPath = buildCanonicalPath(pathname);

  return {
    url: buildSiteUrl(canonicalPath, site),
    changeFrequency: canonicalPath === "/" ? "daily" : "weekly",
    priority: canonicalPath === "/" ? 1 : canonicalPath.startsWith("/reports/") ? 0.6 : 0.8,
  };
}
