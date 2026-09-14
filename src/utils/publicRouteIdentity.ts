export type PublicRouteIdentity =
  | { family: "home"; params?: Record<string, never> }
  | { family: "substances"; params?: Record<string, never> }
  | { family: "substancesGroup"; params: { groupSlug: string } }
  | { family: "chemicalClasses"; params?: Record<string, never> }
  | { family: "chemicalClass"; params: { classKey: string } }
  | { family: "mantras"; params?: Record<string, never> }
  | { family: "replications"; params?: Record<string, never> }
  | { family: "replicationTutorials"; params?: Record<string, never> }
  | { family: "replicationAudio"; params?: Record<string, never> }
  | { family: "replicationInfo"; params?: Record<string, never> }
  | { family: "replicationArtist"; params: { key: string } }
  | { family: "replication"; params: { slug: string } }
  | { family: "substance"; params: { slug: string } }
  | { family: "effects"; params?: Record<string, never> }
  | { family: "effectsGroup"; params: { groupSlug: string } }
  | { family: "effect"; params: { effectSlug: string } }
  | { family: "effectCategory"; params: { categorySlug: string } }
  | { family: "psychoactiveSummary"; params: { summaryPath: string[] } }
  | { family: "articles"; params?: Record<string, never> }
  | { family: "article"; params: { slug: string } }
  // Flavor-gated: only the Effect Index build routes these. They are named here so the
  // path is built and encoded in one place, but they are deliberately absent from
  // STATIC_PUBLIC_PATHS — the sitemap reaches them through its flavor branch instead.
  | { family: "blog"; params?: Record<string, never> }
  | { family: "blogPost"; params: { slug: string } }
  | { family: "donate"; params?: Record<string, never> }
  | { family: "contact"; params?: Record<string, never> }
  | { family: "discord"; params?: Record<string, never> }
  | { family: "copyrightDisclaimer"; params?: Record<string, never> }
  | { family: "documentationStyleGuide"; params?: Record<string, never> }
  | { family: "reports"; params?: Record<string, never> }
  | { family: "reportsGroup"; params: { groupSlug: string } }
  | { family: "report"; params: { slug: string } }
  | { family: "about"; params?: Record<string, never> }
  | { family: "glossary"; params?: Record<string, never> }
  | { family: "category"; params: { categoryKey: string } }
  | { family: "contributor"; params: { profileKey: string } }
  | { family: "mechanism"; params: { mechanismSlug: string } }
  | {
      family: "mechanismQualifier";
      params: { mechanismSlug: string; qualifierSlug: string };
    };

export function normalizeContributorProfileKey(profileKey: string): string {
  return profileKey.trim().toLowerCase();
}

function encodePublicRouteSegment(value: string): string {
  return encodeURIComponent(value.trim());
}

function encodeCanonicalContributorProfileKey(
  profileKey: string,
): string {
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
    case "substancesGroup":
      return `/substances/group/${encodePublicRouteSegment(route.params.groupSlug)}`;
    case "chemicalClasses":
      return "/chemical-classes";
    case "chemicalClass":
      return `/chemical-classes/${encodePublicRouteSegment(route.params.classKey)}`;
    case "mantras":
      return "/mantras";
    case "replications":
      return "/replications";
    case "replicationTutorials":
      return "/replications/tutorials";
    case "replicationAudio":
      return "/replications/audio";
    case "replicationInfo":
      return "/replications/more-info";
    // Focused artist gallery. The reserved segment cannot be claimed by a
    // single-work permalink; former effect/substance playlist routes redirect
    // at their route modules and are not part of the canonical path contract.
    case "replicationArtist":
      return `/replications/artist/${encodePublicRouteSegment(route.params.key)}`;
    // Sits under the same segment as the static `tutorials` / `audio` pages. Next
    // resolves static segments before dynamic ones, and the route plan refuses to
    // emit a replication whose slug would shadow them — see RESERVED_REPLICATION_SLUGS.
    case "replication":
      return `/replications/${encodePublicRouteSegment(route.params.slug)}`;
    case "substance":
      return `/${encodePublicRouteSegment(route.params.slug)}`;
    case "effects":
      return "/effects";
    case "effectsGroup":
      return `/effects/group/${encodePublicRouteSegment(route.params.groupSlug)}`;
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
    case "blog":
      return "/blog";
    case "blogPost":
      return `/blog/${encodePublicRouteSegment(route.params.slug)}`;
    case "donate":
      return "/donate";
    case "contact":
      return "/contact";
    case "discord":
      return "/discord";
    case "copyrightDisclaimer":
      return "/copyright-disclaimer";
    case "documentationStyleGuide":
      return "/documentation-style-guide";
    case "reports":
      return "/reports";
    case "reportsGroup":
      return `/reports/group/${encodePublicRouteSegment(route.params.groupSlug)}`;
    case "report":
      return `/reports/${encodePublicRouteSegment(route.params.slug)}`;
    case "about":
      return "/about";
    case "glossary":
      return "/glossary";
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
