import type { Metadata, MetadataRoute } from "next";
import {
  buildCanonicalPath,
  getPublicRoutePath,
  type PublicRouteIdentity,
} from "../../src/utils/publicRouteIdentity";

export { buildCanonicalPath, getPublicRoutePath, type PublicRouteIdentity };

export const PUBLIC_SITE = {
  name: "dose.wiki",
  url: "https://dose.wiki",
  logoPath: "/icon-512.png",
} as const;

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

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title,
      description,
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
      description,
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
