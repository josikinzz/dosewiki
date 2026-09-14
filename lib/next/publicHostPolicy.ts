import { PUBLIC_LOCALES } from "../../src/i18n/localeRegistry.mjs";

export const PUBLIC_HOSTS: Record<string, true> = {
  "dose.wiki": true,
  "www.dose.wiki": true,
  "effectindex.com": true,
  "www.effectindex.com": true,
};

for (const { publicHost } of PUBLIC_LOCALES) {
  if (publicHost) PUBLIC_HOSTS[publicHost] = true;
}

export function normalizeHost(host: string | null | undefined): string {
  const value = host?.trim().toLowerCase() ?? "";
  return value.startsWith("[") ? value.slice(0, value.indexOf("]") + 1) : value.split(":")[0].replace(/\.$/, "");
}

export function isPublicHost(host: string | null | undefined): boolean {
  return PUBLIC_HOSTS[normalizeHost(host)] === true;
}

/**
 * The host that owns authenticated editorial surfaces.
 *
 * Keeping sessions on one host avoids cross-origin redirects that silently discard
 * authentication cookies.
 */
const EDITOR_DEPLOYMENT_ORIGIN = "https://dev.dose.wiki"

/** Non-public hosts that must remain closed to crawlers. */
export const EDITOR_HOSTS: Record<string, true> = {
  "dev.dose.wiki": true,
  "dosewiki-admin.vercel.app": true,
};

export function isEditorHost(host: string | null | undefined): boolean {
  return EDITOR_HOSTS[normalizeHost(host)] === true;
}

const EDITOR_HANDOFF_PREFIXES: readonly string[] = [
  "/dev",
  "/review",
  "/sign-in",
  "/unauthorized",
  "/invite",
  "/reset-password",
];

/**
 * Credentialed endpoints stay off the public origin. Redirecting them to the editor would
 * drop their cookies, so public-host requests are rejected before route handling instead.
 */
const PUBLIC_RESTRICTED_API_PREFIXES: readonly string[] = [
  "/api/auth",
  "/api/dev",
  "/api/invite",
  "/api/reset-password",
];

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isPublicRestrictedPath(pathname: string): boolean {
  return matchesPrefix(pathname, PUBLIC_RESTRICTED_API_PREFIXES);
}

/** Resolve a public-origin editor link on the host that owns its authenticated session. */
export function getEditorHandoffUrl(
  appPath: string,
  search: string,
  publicHost: boolean,
): URL | null {
  if (!publicHost || !matchesPrefix(appPath, EDITOR_HANDOFF_PREFIXES)) {
    return null;
  }

  return new URL(`${appPath}${search}`, EDITOR_DEPLOYMENT_ORIGIN);
}
