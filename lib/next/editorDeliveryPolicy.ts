import { isEditorHost, isPublicHost, normalizeHost } from "./publicHostPolicy";

export const PRIVATE_CACHE_HEADERS = [
  ["Cache-Control", "private, no-store, max-age=0, must-revalidate"],
  ["CDN-Cache-Control", "no-store"],
  ["Vercel-CDN-Cache-Control", "no-store"],
] as const;

/** No wildcard deployment aliases: an editor artifact must never serve a public origin. */
export function getEditorDeliveryDecision(input: {
  host: string | null;
  editorBuild: boolean;
  allowedHosts?: string;
  development: boolean;
}): "public" | "editor" | "closed" {
  const host = normalizeHost(input.host);
  const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  if (input.development && local) return "public";
  if (!input.editorBuild) return isEditorHost(host) ? "closed" : "public";
  if (isPublicHost(host)) return "closed";
  const allowed = isEditorHost(host) || input.allowedHosts?.split(",").some((entry) => entry.trim().toLowerCase() === host);
  if (!allowed) return "closed";
  return "editor";
}

/** Account bootstrap is public; its handlers enforce credentials and invitation/reset tokens. */
export function isEditorAuthBootstrapPath(pathname: string): boolean {
  return pathname === "/sign-in" || pathname === "/unauthorized"
    || pathname === "/invite" || pathname.startsWith("/invite/")
    || pathname === "/reset-password" || pathname.startsWith("/reset-password/")
    || pathname === "/api/auth" || pathname.startsWith("/api/auth/")
    || pathname === "/api/invite" || pathname.startsWith("/api/invite/")
    || pathname === "/api/reset-password" || pathname.startsWith("/api/reset-password/");
}

export function isPresentationAsset(pathname: string): boolean {

  return pathname.startsWith("/_next/static/") || pathname === "/_next/image"
    || /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|xml|webmanifest|woff2?|zip|md|mp3|ogg|afdesign)$/.test(pathname);
}
/** Only genuine bootstrap resources, never a dynamic page merely ending in .js/.png. */
export function isEditorBootstrapAsset(pathname: string): boolean {
  return pathname.startsWith("/_next/static/") || pathname === "/_next/image"
    || /^\/fonts\/.+\.(?:woff2?|ttf|otf)$/.test(pathname)
    || ["/appearance-chroma.css", "/pro-theme.css", "/theme-light-mode.css",
      "/favicon.svg", "/favicon.ico", "/apple-touch-icon.png", "/icon-192.png",
      "/icon-512.png", "/dosewiki-logo.png", "/effectindex/logo.svg", "/effectindex/icon.png",
      "/effectindex/favicon.png", "/manifest.webmanifest"].includes(pathname);
}
