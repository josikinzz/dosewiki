import routeSynonymData from "@data/substances/routeSynonyms.json" assert { type: "json" };
import {
  parseQualifiedMechanismLabel,
  type QualifiedMechanismLabel,
} from "../../schema/substance/mechanismNormalization";
import { slugify } from "../../utils/slug";
import type {
  NormalizedManualCategoryDefinition,
  NormalizedManualIndexConfig,
} from "./manualIndexLoader";

export type CanonicalRoute = (typeof routeSynonymData.canonicalRoutes)[number];

type TaxonomySurface = | "route"
| "category"
| "psychoactive"
| "chemical"
| "mechanism"
| "effect"

export type TaxonomyRouteSurface = Exclude<TaxonomySurface, "route">;

interface TaxonomyRouteIntent { surface: TaxonomyRouteSurface;
pathname: string; }

export interface TaxonomyIdentifier {
  surface: TaxonomySurface;
  key: string;
  label: string;
  aliases: string[];
  routeIntent?: TaxonomyRouteIntent;
}

export type QualifiedTaxonomyLabel = QualifiedMechanismLabel;

export interface RouteTaxonomyResolution {
  surface: "route";
  normalized: string;
  canonicalRoutes: CanonicalRoute[];
}

export interface ManualLayoutTaxonomy {
  categoryLookup: Map<string, NormalizedManualCategoryDefinition>;
  fallbackCategoryKey: string | null;
  identifiers: TaxonomyIdentifier[];
}

interface SynonymEntry {
  match: string;
  routes: CanonicalRoute[];
}

interface NormalizedSynonymEntry extends SynonymEntry {
  normalized: string;
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

export const CANONICAL_ROUTES = routeSynonymData.canonicalRoutes as CanonicalRoute[];

export function normalizeTaxonomyKey(value: string): string {
  return slugify(value);
}

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

function resolveDirectRoute(normalized: string): CanonicalRoute[] {
  const direct = synonymMap.get(normalized);
  if (direct) {
    return direct;
  }

  const stripped = stripStopWords(normalized);
  if (stripped !== normalized) {
    const fallback = synonymMap.get(stripped);
    if (fallback) {
      return fallback;
    }
  }

  const withoutParentheses = normalizeRouteTokenInternal(stripParenthetical(normalized));
  if (withoutParentheses && withoutParentheses !== normalized) {
    const fallback = synonymMap.get(withoutParentheses);
    if (fallback) {
      return fallback;
    }
  }

  return [];
}

function resolveCanonicalRoutes(descriptor: string): CanonicalRoute[] {
  const normalized = normalizeRouteTokenInternal(descriptor);
  if (!normalized) {
    return [];
  }

  const direct = resolveDirectRoute(normalized);
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

export function resolveRouteTaxonomy(descriptor: string): RouteTaxonomyResolution {
  return {
    surface: "route",
    normalized: normalizeRouteTokenInternal(descriptor),
    canonicalRoutes: resolveCanonicalRoutes(descriptor),
  };
}


export function canonicalizeRouteLabel(label: string): {
  canonicalRoutes: CanonicalRoute[];
  normalized: string;
} {
  const resolution = resolveRouteTaxonomy(label);
  return {
    canonicalRoutes: resolution.canonicalRoutes,
    normalized: resolution.normalized,
  };
}



export function parseQualifiedTaxonomyLabel(entry: string): QualifiedTaxonomyLabel {
  return parseQualifiedMechanismLabel(entry);
}

export function createTaxonomyIdentifier(
  surface: TaxonomyRouteSurface,
  label: string,
  routePathPrefix: string,
  aliases: string[] = [],
): TaxonomyIdentifier {
  const key = normalizeTaxonomyKey(label);
  const aliasKeys = Array.from(
    new Set([key, ...aliases.map((alias) => normalizeTaxonomyKey(alias)).filter(Boolean)]),
  );

  return {
    surface,
    key,
    label,
    aliases: aliasKeys,
    routeIntent: {
      surface,
      pathname: `${routePathPrefix}/${key}`,
    },
  };
}

export function createManualLayoutTaxonomy(
  config: NormalizedManualIndexConfig,
): ManualLayoutTaxonomy {
  const categoryLookup = new Map<string, NormalizedManualCategoryDefinition>();
  const identifiers: TaxonomyIdentifier[] = [];

  config.categories.forEach((category) => {
    const aliases = new Set<string>([category.normalizedKey, normalizeTaxonomyKey(category.label)]);

    aliases.forEach((alias) => {
      if (!categoryLookup.has(alias)) {
        categoryLookup.set(alias, category);
      }
    });

    identifiers.push({
      surface: "category",
      key: category.normalizedKey,
      label: category.label,
      aliases: Array.from(aliases),
      routeIntent: {
        surface: "category",
        pathname: `/category/${category.normalizedKey}`,
      },
    });
  });

  const fallbackCategoryKey =
    config.categories.find((category) => category.normalizedKey === "miscellaneous")?.normalizedKey
    ?? null;

  return {
    categoryLookup,
    fallbackCategoryKey,
    identifiers,
  };
}
