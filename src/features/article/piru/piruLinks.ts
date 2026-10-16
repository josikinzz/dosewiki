const PIRU_LINK_ORIGIN = "https://kagerou.glass";
const PIRU_LOG_PATH = "/piru/log";
const PIRU_OPEN_PATH = "/piru/open";
const REFERRER_VALUE = "dosewiki";

export function piruRouteParam(
  routeKey: string | null | undefined,
): string | null {
  const normalized = (routeKey ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

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

export function buildPiruOpenHref(slug: string): string {
  return buildHref(PIRU_OPEN_PATH, [
    ["substance", slug],
    ["from", REFERRER_VALUE],
  ]);
}
