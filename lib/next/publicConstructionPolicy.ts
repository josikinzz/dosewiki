import type { MetadataRoute } from "next";

export const PUBLIC_CONSTRUCTION_HOSTS = new Set(["dose.wiki", "www.dose.wiki"]);

const PUBLIC_CONSTRUCTION_ALLOWED_PATHS = new Set([
  "/",
  "/api/csp-report",
  "/apple-touch-icon.png",
  "/dosewiki-logo.png",
  "/docs/license",
  "/effectindex/favicon.png",
  "/effectindex/icon.png",
  "/embed-logo.webp",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
]);

export function normalizeHost(host: string | null | undefined): string {
  return host?.split(":")[0]?.toLowerCase() ?? "";
}

export function isPublicConstructionHost(host: string | null | undefined): boolean {
  return PUBLIC_CONSTRUCTION_HOSTS.has(normalizeHost(host));
}

export function isPublicConstructionAllowedPath(pathname: string): boolean {
  return (
    PUBLIC_CONSTRUCTION_ALLOWED_PATHS.has(pathname) ||
    pathname === "/api/v1" ||
    pathname.startsWith("/api/v1/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/assets/") ||
    // The holding page is the homepage, so it carries the footer's supporter credit. The
    // mark is a CSS mask rather than an `<img>`, and a redirected mask resolves to no
    // silhouette at all — the lockup would print as a solid block.
    pathname.startsWith("/supporters/")
  );
}

/**
 * The host that owns the editor.
 *
 * A subdomain of the real domain rather than the `.vercel.app` deployment name: it is the
 * address a person can type, it survives the project being renamed, and it keeps the
 * editor's session cookies on a host that reads like the site they belong to. It is
 * ungated on purpose - the whole app answers there, exactly as the admin deployment
 * already does - and kept out of every index by {@link EDITOR_HOSTS}.
 */
export const EDITOR_DEPLOYMENT_ORIGIN = "https://dev.dose.wiki";

/**
 * Hosts that serve the working deployment: the finished site months before its public
 * launch, plus the editor. Nothing here may be crawled - the launch is the publication
 * event, and an indexed mirror of it would front-run that on someone else's schedule.
 */
export const EDITOR_HOSTS = new Set(["dev.dose.wiki", "dosewiki-admin.vercel.app"]);

export function isEditorHost(host: string | null | undefined): boolean {
  return EDITOR_HOSTS.has(normalizeHost(host));
}

/**
 * Editor surfaces that keep working on the construction hosts by crossing to the
 * deployment that owns them: `https://dose.wiki/dev/articles` lands on the same path of
 * `EDITOR_DEPLOYMENT_ORIGIN`, signed in against that host's session as it always was.
 *
 * They get no address of their own on the public domain — not bare and not under
 * `/preview` — because the gate exists to keep a sign-in surface off it months before it
 * has one. A dead end on the holding page was the earlier answer, and it lost the link.
 */
const CONSTRUCTION_HANDOFF_PREFIXES: readonly string[] = [
  "/dev",
  "/review",
  "/sign-in",
  "/unauthorized",
];

/**
 * Credentialed endpoints, which the public domain must not carry either. Unlike the
 * surfaces above they are never handed off: a cross-origin redirect of an authenticated
 * request arrives without its cookies, so a caller would read the bounce as a signed-out
 * session rather than as the wrong host.
 */
const CONSTRUCTION_ADMIN_ONLY_API_PREFIXES: readonly string[] = [
  "/api/auth",
  "/api/dev",
  "/api/save-user-profile",
];

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Surfaces the `/preview` address space never carries. */
export function isConstructionPreviewBlockedPath(pathname: string): boolean {
  return (
    matchesPrefix(pathname, CONSTRUCTION_HANDOFF_PREFIXES) ||
    matchesPrefix(pathname, CONSTRUCTION_ADMIN_ONLY_API_PREFIXES)
  );
}

/**
 * Where an editor link typed against a construction host should actually land, or `null`
 * when this host owns the surface itself and the ordinary address already works.
 */
export function getEditorHandoffUrl(
  appPath: string,
  search: string,
  publicConstructionHost: boolean,
): URL | null {
  if (!publicConstructionHost || !matchesPrefix(appPath, CONSTRUCTION_HANDOFF_PREFIXES)) {
    return null;
  }

  return new URL(`${appPath}${search}`, EDITOR_DEPLOYMENT_ORIGIN);
}

export function buildPublicConstructionRobotsPolicy(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/$",
      disallow: "/",
    },
  };
}
