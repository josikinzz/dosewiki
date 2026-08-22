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
 * Surfaces the `/preview` address space never carries.
 *
 * Preview exists so a reader can use the finished *public* site on the real domain before
 * launch. The editor, the review workbench, sign-in and the credentialed APIs are not that
 * site: they are the admin deployment's job, they are the half of the app the construction
 * gate is actually protecting, and a preview address for them would hand the public domain
 * a sign-in surface months before it has one.
 */
const CONSTRUCTION_PREVIEW_BLOCKED_PREFIXES: readonly string[] = [
  "/api/auth",
  "/api/dev",
  "/api/save-user-profile",
  "/dev",
  "/review",
  "/sign-in",
  "/unauthorized",
];

export function isConstructionPreviewBlockedPath(pathname: string): boolean {
  return CONSTRUCTION_PREVIEW_BLOCKED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
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
