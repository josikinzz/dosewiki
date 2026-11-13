export type JournalAppId = "piru";

export interface JournalApp {
  readonly id: JournalAppId;
  readonly name: string;
  readonly host: string;
  readonly buildLogHref: (slug: string, routeKey?: string | null) => string;
}

interface JournalFlavorFlags {
  readonly showPiruLinks: boolean;
}

const REFERRER_VALUE = "dosewiki";

export function journalRouteParam(
  routeKey: string | null | undefined,
): string | null {
  const normalized = (routeKey ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function buildHref(
  origin: string,
  path: string,
  params: ReadonlyArray<readonly [string, string | null]>,
): string {
  const query = params
    .filter((entry): entry is readonly [string, string] => entry[1] !== null)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return `${origin}${path}?${query}`;
}

const PIRU: JournalApp = {
  id: "piru",
  name: "Piru",
  host: "kagerou.glass",
  buildLogHref: (slug, routeKey) =>
    buildHref("https://kagerou.glass", "/piru/log", [
      ["substance", slug],
      ["route", journalRouteParam(routeKey)],
      ["from", REFERRER_VALUE],
    ]),
};

export const JOURNAL_APPS: readonly JournalApp[] = [PIRU];

export function enabledJournalAppIds(
  flags: JournalFlavorFlags,
): JournalAppId[] {
  return JOURNAL_APPS.filter((app) => app.id !== "piru" || flags.showPiruLinks)
    .map((app) => app.id);
}

export function journalAppsById(
  ids: readonly JournalAppId[],
): JournalApp[] {
  return JOURNAL_APPS.filter((app) => ids.includes(app.id));
}
