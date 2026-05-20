import type { Metadata, MetadataRoute } from "next";

export const PUBLIC_SITE = {
  name: "dose.wiki",
  url: "https://dose.wiki",
  logoPath: "/icon-512.png",
} as const;

export type PublicRouteIdentity =
  | { family: "home"; params?: Record<string, never> }
  | { family: "substances"; params?: Record<string, never> }
  | { family: "substance"; params: { slug: string } }
  | { family: "effects"; params?: Record<string, never> }
  | { family: "effect"; params: { effectSlug: string } }
  | { family: "effectCategory"; params: { categorySlug: string } }
  | { family: "reports"; params?: Record<string, never> }
  | { family: "report"; params: { slug: string } }
  | { family: "about"; params?: Record<string, never> }
  | { family: "category"; params: { categoryKey: string } }
  | { family: "contributor"; params: { profileKey: string } }
  | { family: "chemicalClass"; params: { slug: string } }
  | { family: "psychoactiveClass"; params: { slug: string } }
  | { family: "mechanism"; params: { mechanismSlug: string } }
  | { family: "mechanismQualifier"; params: { mechanismSlug: string; qualifierSlug: string } };

export type PublicPageMetadataInput = {
  title: string;
  description: string;
  route?: PublicRouteIdentity;
  pathname?: string;
  noIndex?: boolean;
};

export function getPublicRoutePath(route: PublicRouteIdentity): string {
  switch (route.family) {
    case "home":
      return "/";
    case "substances":
      return "/substances";
    case "substance":
      return `/${route.params.slug}`;
    case "effects":
      return "/effects";
    case "effect":
      return `/effects/${route.params.effectSlug}`;
    case "effectCategory":
      return `/effects/category/${route.params.categorySlug}`;
    case "reports":
      return "/reports";
    case "report":
      return `/reports/${route.params.slug}`;
    case "about":
      return "/about";
    case "category":
      return `/category/${route.params.categoryKey}`;
    case "contributor":
      return `/contributors/${encodeURIComponent(route.params.profileKey)}`;
    case "chemicalClass":
      return `/chemical/${route.params.slug}`;
    case "psychoactiveClass":
      return `/psychoactive/${route.params.slug}`;
    case "mechanism":
      return `/mechanism/${route.params.mechanismSlug}`;
    case "mechanismQualifier":
      return `/mechanism/${route.params.mechanismSlug}/${route.params.qualifierSlug}`;
  }
}

export function buildCanonicalPath(pathname: string): string {
  if (!pathname) {
    return "/";
  }

  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

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
