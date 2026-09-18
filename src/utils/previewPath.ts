/**
 * Parser for pre-launch `/preview` links. Middleware uses it only to issue permanent
 * redirects to ordinary App Paths; client code never renders inside this address space.
 */
export const PREVIEW_PATH_PREFIX = "/preview";

/** Preview suffixes that map to the launched homepage. */
const PREVIEW_HOME_SUFFIXES = ["", "/", "/home", "/home/"] as const;

export function stripPreviewPrefix(pathname: string): string | null {
  if (!pathname.startsWith(PREVIEW_PATH_PREFIX)) {
    return null;
  }

  const suffix = pathname.slice(PREVIEW_PATH_PREFIX.length);

  if ((PREVIEW_HOME_SUFFIXES as readonly string[]).includes(suffix)) {
    return "/";
  }

  if (!suffix.startsWith("/")) {
    return null;
  }

  return suffix;
}
