/**
 * Links from substance articles into Piru, an independent dose journal that
 * reads the dose.wiki dataset and stores each substance's dose.wiki slug.
 *
 * Every link is an https URL on kagerou.glass, never a `piru://` scheme. The
 * same URL opens the installed app (Universal Link on iOS, App Link on
 * Android). Without the app, kagerou.glass redirects a `from=dosewiki` link to
 * the Piru entry on dose.wiki's About page, so the article never has to detect
 * whether Piru is installed. A custom scheme with the app missing shows the
 * browser's "invalid address" alert instead, which is why none appear here.
 *
 * dose.wiki itself records nothing about these taps.
 */

const PIRU_LINK_ORIGIN = "https://kagerou.glass";
const PIRU_LOG_PATH = "/piru/log";
const PIRU_OPEN_PATH = "/piru/open";
const REFERRER_VALUE = "dosewiki";

/**
 * The route key as Piru reads it: the article's canonical route name,
 * lowercased (`Oral` → `oral`). Piru parses route names case-insensitively;
 * an empty key yields `null`, and the link then carries the substance alone.
 */
export function piruRouteParam(
  routeKey: string | null | undefined,
): string | null {
  const normalized = (routeKey ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Percent-encodes with `encodeURIComponent` rather than `URLSearchParams`,
 * which writes a space as `+`: Foundation's `URLComponents` on the iOS side
 * reads `+` literally.
 */
function buildHref(
  path: string,
  params: ReadonlyArray<readonly [string, string | null]>,
): string {
  const query = params
    .filter((entry): entry is readonly [string, string] => entry[1] !== null)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return `${PIRU_LINK_ORIGIN}${path}?${query}`;
}

/** Opens Piru's quick log with the substance and route staged. */
export function buildPiruLogHref(
  slug: string,
  routeKey?: string | null,
): string {
  return buildHref(PIRU_LOG_PATH, [
    ["substance", slug],
    ["route", piruRouteParam(routeKey)],
    ["from", REFERRER_VALUE],
  ]);
}

/** Opens the substance's page in Piru. */
export function buildPiruOpenHref(slug: string): string {
  return buildHref(PIRU_OPEN_PATH, [
    ["substance", slug],
    ["from", REFERRER_VALUE],
  ]);
}
