/**
 * The `/preview` address space.
 *
 * `dose.wiki` and `www.dose.wiki` are held at the construction landing until launch, but
 * the finished site still has to be readable on the real domain rather than only on the
 * `dosewiki-admin` Vercel host. `/preview/...` is that address space: the middleware
 * rewrites a preview request onto the ordinary route it mirrors, so `/preview/substances`
 * renders `/substances` while the address bar keeps the prefix, and on the construction
 * hosts every non-allowlisted bare path is redirected *into* the prefix. That redirect is
 * what makes the whole site usable without prefixing a single `href`: an ordinary
 * `<Link href="/substances/2c-b">` inside a preview page still lands under `/preview`.
 *
 * The homepage is `/preview/home`, not `/preview`, because `/` on a construction host is
 * the blocked landing — the real homepage needs an address of its own. `/preview` itself
 * resolves to the same place so a typed-in bare prefix is not a dead end.
 *
 * This module is shared by the Edge middleware and by client components (which strip the
 * prefix before reading route identity), so it stays dependency-free.
 */

export const PREVIEW_PATH_PREFIX = "/preview";

/** The preview address of the site homepage. */
export const PREVIEW_HOME_PATH = "/preview/home";

/**
 * Preview suffixes that address the homepage rather than a route below it. Compared
 * directly rather than looked up: a keyed object answers `constructor` truthily off the
 * prototype, and `/previewconstructor` would resolve to the homepage.
 */
const PREVIEW_HOME_SUFFIXES = ["", "/", "/home", "/home/"] as const;

/**
 * The app path a preview request addresses, or `null` when the path is not a preview
 * address at all. `/previewing` is not `/preview` + `ing`, hence the suffix check rather
 * than a bare `startsWith`.
 */
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

/** `true` when this request path lives in the preview address space. */
export function isPreviewPath(pathname: string): boolean {
  return stripPreviewPrefix(pathname) !== null;
}

/**
 * The preview address of an app path. The homepage maps to {@link PREVIEW_HOME_PATH};
 * everything else is prefixed verbatim, so the mapping round-trips through
 * {@link stripPreviewPrefix}.
 */
export function toPreviewPath(appPath: string): string {
  if (appPath === "/" || appPath === "") {
    return PREVIEW_HOME_PATH;
  }

  return `${PREVIEW_PATH_PREFIX}${appPath.startsWith("/") ? appPath : `/${appPath}`}`;
}

/**
 * The route identity of a path as the app models it: preview addresses answer with the
 * page they render. Client code that branches on the pathname — chrome shape, active nav,
 * page titles — must read this rather than `usePathname()` directly, or every one of those
 * branches silently falls through on `/preview/...`.
 */
export function toAppPath(pathname: string): string {
  return stripPreviewPrefix(pathname) ?? pathname;
}
