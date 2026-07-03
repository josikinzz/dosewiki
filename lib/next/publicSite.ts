import type { Metadata, MetadataRoute } from "next";
import {
  buildCanonicalPath,
  getPublicRoutePath,
  type PublicRouteIdentity,
} from "../../src/utils/publicRouteIdentity";

export { buildCanonicalPath, getPublicRoutePath, type PublicRouteIdentity };

export const DEFAULT_PUBLIC_SITE_URL = "https://dosewiki-admin.vercel.app";
export const PUBLIC_LAUNCH_SITE_URL = "https://dose.wiki";

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

export function getPublicSiteUrl(
  env: PublicSiteEnv = { NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL },
): string {
  return normalizeSiteUrl(env.NEXT_PUBLIC_SITE_URL) ?? DEFAULT_PUBLIC_SITE_URL;
}

export const PUBLIC_SITE = {
  name: "dose.wiki",
  url: getPublicSiteUrl(),
  logoPath: "/icon-512.png",
} as const;

const MAX_META_DESCRIPTION_LENGTH = 180;
const MIN_META_DESCRIPTION_LENGTH = 50;
const SHORT_META_DESCRIPTION_SUFFIX = " Explore related dose.wiki records, sources, and route context.";

export type PublicPageMetadataInput = {
  title: string;
  description: string;
  route?: PublicRouteIdentity;
  pathname?: string;
  noIndex?: boolean;
};

export function buildSiteUrl(pathname = "/"): string {
  return new URL(buildCanonicalPath(pathname), PUBLIC_SITE.url).toString();
}

export function buildSiteAssetUrl(pathname: string): string {
  return buildSiteUrl(pathname);
}

function buildMetaDescription(description: string): string {
  let normalized = description.replace(/\s+/g, " ").trim();

  if (normalized && normalized.length < MIN_META_DESCRIPTION_LENGTH) {
    normalized = `${normalized.replace(/\.$/, "")}.${SHORT_META_DESCRIPTION_SUFFIX}`;
  }

  if (normalized.length <= MAX_META_DESCRIPTION_LENGTH) {
    return normalized;
  }

  const truncated = normalized.slice(0, MAX_META_DESCRIPTION_LENGTH - 3);
  const lastSpaceIndex = truncated.lastIndexOf(" ");
  const snippet = lastSpaceIndex > 100 ? truncated.slice(0, lastSpaceIndex) : truncated;

  return `${snippet.trimEnd()}...`;
}

export function buildPublicPageMetadata({
  title,
  description,
  route,
  pathname,
  noIndex = false,
}: PublicPageMetadataInput): Metadata {
  const canonicalPath = buildCanonicalPath(pathname ?? (route ? getPublicRoutePath(route) : "/"));
  const absoluteUrl = buildSiteUrl(canonicalPath);
  const logoUrl = buildSiteAssetUrl(PUBLIC_SITE.logoPath);
  const metaDescription = buildMetaDescription(description);

  return {
    title,
    description: metaDescription,
    alternates: {
      canonical: absoluteUrl,
    },
    openGraph: {
      title,
      description: metaDescription,
      url: absoluteUrl,
      siteName: PUBLIC_SITE.name,
      type: "website",
      images: [
        {
          url: logoUrl,
          width: 512,
          height: 512,
          alt: `${PUBLIC_SITE.name} logo`,
        },
      ],
    },
    twitter: {
      card: "summary",
      title,
      description: metaDescription,
      images: [logoUrl],
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
        }
      : undefined,
  };
}

export function buildPublicSitemapEntry(pathname: string): MetadataRoute.Sitemap[number] {
  const canonicalPath = buildCanonicalPath(pathname);

  return {
    url: buildSiteUrl(canonicalPath),
    changeFrequency: canonicalPath === "/" ? "daily" : "weekly",
    priority: canonicalPath === "/" ? 1 : canonicalPath.startsWith("/reports/") ? 0.6 : 0.8,
  };
}
