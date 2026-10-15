export const PREVIEW_PATH_PREFIX = "/preview";

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
