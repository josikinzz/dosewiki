export type PublicRouteIdentity =
  | { family: "home"; params?: Record<string, never> }
  | { family: "substances"; params?: Record<string, never> }
  | { family: "chemicalClasses"; params?: Record<string, never> }
  | { family: "chemicalClass"; params: { classKey: string } }
  | { family: "mantras"; params?: Record<string, never> }
  | { family: "replicationTutorials"; params?: Record<string, never> }
  | { family: "replicationAudio"; params?: Record<string, never> }
  | { family: "substance"; params: { slug: string } }
  | { family: "effects"; params?: Record<string, never> }
  | { family: "effect"; params: { effectSlug: string } }
  | { family: "effectCategory"; params: { categorySlug: string } }
  | { family: "psychoactiveSummary"; params: { summaryPath: string[] } }
  | { family: "articles"; params?: Record<string, never> }
  | { family: "article"; params: { slug: string } }
  | { family: "reports"; params?: Record<string, never> }
  | { family: "report"; params: { slug: string } }
  | { family: "about"; params?: Record<string, never> }
  | { family: "category"; params: { categoryKey: string } }
  | { family: "contributor"; params: { profileKey: string } }
  | { family: "mechanism"; params: { mechanismSlug: string } }
  | { family: "mechanismQualifier"; params: { mechanismSlug: string; qualifierSlug: string } };

export function normalizeContributorProfileKey(profileKey: string): string {
  return profileKey.trim().toLowerCase();
}

export function encodePublicRouteSegment(value: string): string {
  return encodeURIComponent(value.trim());
}

export function encodeCanonicalContributorProfileKey(profileKey: string): string {
  return encodePublicRouteSegment(normalizeContributorProfileKey(profileKey));
}

export function buildCanonicalPath(pathname: string): string {
  if (!pathname) {
    return "/";
  }

  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

export function getPublicRoutePath(route: PublicRouteIdentity): string {
  switch (route.family) {
    case "home":
      return "/";
    case "substances":
      return "/substances";
    case "chemicalClasses":
      return "/chemical-classes";
    case "chemicalClass":
      return `/chemical-classes/${encodePublicRouteSegment(route.params.classKey)}`;
    case "mantras":
      return "/mantras";
    case "replicationTutorials":
      return "/replications/tutorials";
    case "replicationAudio":
      return "/replications/audio";
    case "substance":
      return `/${encodePublicRouteSegment(route.params.slug)}`;
    case "effects":
      return "/effects";
    case "effect":
      return `/effects/${encodePublicRouteSegment(route.params.effectSlug)}`;
    case "effectCategory":
      return `/effects/category/${encodePublicRouteSegment(route.params.categorySlug)}`;
    case "psychoactiveSummary":
      return `/psychoactive/${route.params.summaryPath
        .map(encodePublicRouteSegment)
        .join("/")}`;
    case "articles":
      return "/articles";
    case "article":
      return `/articles/${encodePublicRouteSegment(route.params.slug)}`;
    case "reports":
      return "/reports";
    case "report":
      return `/reports/${encodePublicRouteSegment(route.params.slug)}`;
    case "about":
      return "/about";
    case "category":
      return `/category/${encodePublicRouteSegment(route.params.categoryKey)}`;
    case "contributor":
      return `/contributors/${encodeCanonicalContributorProfileKey(route.params.profileKey)}`;
    case "mechanism":
      return `/mechanism/${encodePublicRouteSegment(route.params.mechanismSlug)}`;
    case "mechanismQualifier":
      return `/mechanism/${encodePublicRouteSegment(route.params.mechanismSlug)}/${encodePublicRouteSegment(route.params.qualifierSlug)}`;
  }
}
