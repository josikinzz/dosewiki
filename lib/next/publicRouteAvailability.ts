import { glossaryLanguage } from "../../src/features/language-glossary/languageGlossary";
import manifest from "../../src/data/publicRouteAvailability.generated.json";
import { PUBLIC_LOCALES } from "../../src/i18n/localeRegistry.mjs";

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
  "china",
  "effect",
  "effects",
  "glossary",
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
  "subscribe",
  "substances",
  "unauthorized",
  "under-construction",
]);

for (const { pathPrefix } of PUBLIC_LOCALES) {
  if (pathPrefix) ROOT_ROUTE_SEGMENTS.add(pathPrefix.slice(1));
}

function decodeSegment(value: string): string | null {
  try {
    return decodeURIComponent(value).trim().toLowerCase();
  } catch {
    return null;
  }
}

export function isUnavailablePublicDynamicPath(pathname: string): boolean {
  const glossaryMatch = pathname.match(/^\/glossary\/([^/]+)\/?$/);
  if (glossaryMatch && glossaryMatch[1] !== "languages" && glossaryMatch[1] !== "en") {
    try { return !glossaryLanguage(decodeURIComponent(glossaryMatch[1])); } catch { return true; }
  }
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
  if (slug.includes(".")) return false;
  return !ROOT_ROUTE_SEGMENTS.has(slug) && !substanceSlugs.has(slug);
}

export function publicSubstanceSlugForPath(pathname: string): string | null {
  const rootMatch = pathname.match(/^\/([^/]+)\/?$/);
  if (!rootMatch) return null;
  const slug = decodeSegment(rootMatch[1]);
  return slug && substanceSlugs.has(slug) ? slug : null;
}
