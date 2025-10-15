import routeSynonymData from "./routeSynonyms.json" assert { type: "json" };

export type CanonicalRoute = (typeof routeSynonymData.canonicalRoutes)[number];

export const CANONICAL_ROUTES = routeSynonymData.canonicalRoutes as CanonicalRoute[];

interface SynonymEntry {
  match: string;
  routes: CanonicalRoute[];
}

interface NormalizedSynonymEntry extends SynonymEntry {
  normalized: string;
}

const synonymEntries: NormalizedSynonymEntry[] = routeSynonymData.synonyms.map((entry) => {
  const normalized = normalizeRouteTokenInternal(entry.match);
  const routes = entry.routes.filter((route): route is CanonicalRoute =>
    (routeSynonymData.canonicalRoutes as string[]).includes(route),
  );
  return {
    match: entry.match,
    routes,
    normalized,
  };
});

const synonymMap: Map<string, CanonicalRoute[]> = new Map();

for (const entry of synonymEntries) {
  if (!synonymMap.has(entry.normalized)) {
    synonymMap.set(entry.normalized, []);
  }
  const target = synonymMap.get(entry.normalized);
  if (target) {
    for (const route of entry.routes) {
      if (!target.includes(route)) {
        target.push(route);
      }
    }
  }
}

const STOP_WORDS = [
  "route",
  "routes",
  "administration",
  "administrations",
  "administered",
  "administering",
  "use",
  "usage",
  "only",
  "form",
  "forms",
  "via",
];

const COMPOSITE_SEPARATORS: Array<{ test: RegExp; split: RegExp }> = [
  { test: /\//, split: /\s*\/\s*/ },
  { test: /\band\b/, split: /\s+and\s+/ },
  { test: /\b&\b/, split: /\s*&\s*/ },
  { test: /\bplus\b/, split: /\s+plus\s+/ },
  { test: /\bwith\b/, split: /\s+with\s+/ },
  { test: /\bor\b/, split: /\s+or\s+/ },
  { test: /,/, split: /\s*,\s*/ },
  { test: /\bvs\.?\b/, split: /\s+vs\.?\s+/ },
];

function normalizeWhitespace(value: string): string {
  return value
    .replace(/[\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function stripParenthetical(value: string): string {
  return normalizeWhitespace(value.replace(/\([^)]*\)/g, " "));
}

function normalizeRouteTokenInternal(value: string | undefined | null): string {
  if (!value) {
    return "";
  }

  const lower = value
    .toLowerCase()
    .replace(/[\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/[•·]/g, " ")
    .replace(/[^a-z0-9/&+\s.-]/g, (match) => {
      if (match === "½") {
        return "1/2";
      }
      return " ";
    });

  const collapsed = lower.replace(/\s+/g, " ").trim();
  return collapsed.replace(/[.-]+$/g, "");
}

export function normalizeRouteToken(value: string | undefined | null): string {
  return normalizeRouteTokenInternal(value);
}

function stripStopWords(value: string): string {
  const tokens = value.split(" ").filter(Boolean);
  while (tokens.length > 0 && STOP_WORDS.includes(tokens[tokens.length - 1]!)) {
    tokens.pop();
  }
  return tokens.join(" ");
}

function uniqueRoutes(routes: CanonicalRoute[]): CanonicalRoute[] {
  return routes.filter((route, index, list) => list.indexOf(route) === index);
}

function splitComposite(normalized: string): string[] | undefined {
  for (const { test, split } of COMPOSITE_SEPARATORS) {
    if (test.test(normalized)) {
      const parts = normalized.split(split).map((part) => normalizeRouteTokenInternal(part));
      if (parts.some((part) => part.length === 0)) {
        continue;
      }
      return parts;
    }
  }
  return undefined;
}

function resolveDirect(normalized: string): CanonicalRoute[] {
  const direct = synonymMap.get(normalized);
  if (direct) {
    return direct;
  }

  // Attempt to drop stop words
  const stripped = stripStopWords(normalized);
  if (stripped !== normalized) {
    const fallback = synonymMap.get(stripped);
    if (fallback) {
      return fallback;
    }
  }

  // Attempt without parenthetical content
  const withoutParentheses = normalizeRouteTokenInternal(stripParenthetical(normalized));
  if (withoutParentheses && withoutParentheses !== normalized) {
    const fallback = synonymMap.get(withoutParentheses);
    if (fallback) {
      return fallback;
    }
  }

  return [];
}

export function resolveCanonicalRoutes(descriptor: string): CanonicalRoute[] {
  const normalized = normalizeRouteTokenInternal(descriptor);
  if (!normalized) {
    return [];
  }

  const direct = resolveDirect(normalized);
  if (direct.length > 0) {
    return uniqueRoutes(direct);
  }

  const composite = splitComposite(normalized);
  if (composite) {
    const aggregate: CanonicalRoute[] = [];
    for (const part of composite) {
      const resolved = resolveCanonicalRoutes(part);
      aggregate.push(...resolved);
    }
    if (aggregate.length > 0) {
      return uniqueRoutes(aggregate);
    }
  }

  const withoutStopWords = stripStopWords(normalized);
  if (withoutStopWords && withoutStopWords !== normalized) {
    const resolved = resolveCanonicalRoutes(withoutStopWords);
    if (resolved.length > 0) {
      return uniqueRoutes(resolved);
    }
  }

  return [];
}

export function getCanonicalRoute(descriptor: string): CanonicalRoute | undefined {
  const routes = resolveCanonicalRoutes(descriptor);
  if (routes.length === 1) {
    return routes[0];
  }
  return undefined;
}

export function canonicalizeRouteLabel(label: string): {
  canonicalRoutes: CanonicalRoute[];
  normalized: string;
} {
  return {
    canonicalRoutes: resolveCanonicalRoutes(label),
    normalized: normalizeRouteTokenInternal(label),
  };
}

export function isCanonicalRoute(value: string): value is CanonicalRoute {
  return (routeSynonymData.canonicalRoutes as string[]).includes(value);
}

export function getSynonymEntries(): ReadonlyArray<NormalizedSynonymEntry> {
  return synonymEntries;
}
