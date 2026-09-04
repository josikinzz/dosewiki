import manifest from "../../src/data/publicRouteAvailability.generated.json";

const substanceSlugs = new Set<string>(manifest.substances);
const replicationSlugs = new Set<string>(manifest.replications);

const REPLICATION_STATIC_SEGMENTS = new Set([
  "artist",
  "audio",
  "more-info",
  "tutorials",
]);

const ROOT_ROUTE_SEGMENTS = new Set([
  "about",
  "api",
  "articles",
  "blog",
  "category",
  "changes",
  "chemical",
  "chemical-classes",
  "contact",
  "contributors",
  "copyright-disclaimer",
  "data",
  "dev",
  "discord",
  "docs",
  "documentation-style-guide",
  "donate",
  "effect",
  "effects",
  "html-docs",
  "interactions",
  "invite",
  "mantras",
  "mechanism",
  "open-data",
  "psychoactive",
  "replications",
  "reset-password",
  "reports",
  "review",
  "search",
  "sign-in",
  "substances",
  "unauthorized",
  "under-construction",
]);

function decodeSegment(value: string): string | null {
  try {
    return decodeURIComponent(value).trim().toLowerCase();
  } catch {
    return null;
  }
}

/** Reject dynamic page paths that are absent from the build's public corpus. */
export function isUnavailablePublicDynamicPath(pathname: string): boolean {
  const replicationMatch = pathname.match(/^\/replications\/([^/]+)\/?$/);
  if (replicationMatch) {
    const slug = decodeSegment(replicationMatch[1]);
    return Boolean(
      !slug ||
        (!REPLICATION_STATIC_SEGMENTS.has(slug) && !replicationSlugs.has(slug)),
    );
  }

  const rootMatch = pathname.match(/^\/([^/]+)\/?$/);
  if (!rootMatch) return false;
  const slug = decodeSegment(rootMatch[1]);
  if (!slug) return true;
  // A root file (`/robots.txt`, `/llms.txt`, the open-data JSON dumps) is a
  // metadata route or a public/ asset, never a substance slug: no slug carries
  // a dot. Left to the slug check they answered 404 from 2026-08-31 until this.
  if (slug.includes(".")) return false;
  return !ROOT_ROUTE_SEGMENTS.has(slug) && !substanceSlugs.has(slug);
}
