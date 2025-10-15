#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const ARTICLES_PATH = path.join(ROOT, "src", "data", "articles.json");
const OUTPUT_PATH = path.join(ROOT, "src", "data", "articles.duration-migrated.json");
const SKIP_LIST_PATH = path.join(ROOT, "src", "data", "durationMigrationSkips.json");

const STAGE_KEYS = ["total_duration", "onset", "peak", "offset", "after_effects"];

const routeSynonymData = JSON.parse(
  readFileSync(path.join(ROOT, "src", "data", "routeSynonyms.json"), "utf8"),
);

const canonicalRoutes = routeSynonymData.canonicalRoutes;

const normalizedSynonyms = buildSynonymMap(routeSynonymData.synonyms);

const routeDetectionRules = buildRouteDetectionRules();
const routeRemovalPatterns = buildRouteRemovalPatterns();

const articles = JSON.parse(readFileSync(ARTICLES_PATH, "utf8"));

const migratedArticles = JSON.parse(JSON.stringify(articles));

const ambiguousSegments = [];
const routeMismatchEntries = [];

const summaryCounts = {
  processed: 0,
  migrated: 0,
  skippedAmbiguous: 0,
  skippedMismatched: 0,
};

for (const article of migratedArticles) {
  const sourceArticle = articles.find((candidate) => candidate.id === article.id);
  if (!sourceArticle) {
    continue;
  }

  const duration = sourceArticle?.drug_info?.duration;
  const dosageRoutes = sourceArticle?.drug_info?.dosages?.routes_of_administration ?? [];

  if (!duration || typeof duration !== "object" || Array.isArray(duration)) {
    continue;
  }

  summaryCounts.processed += 1;

  const routeDefinitions = dosageRoutes
    .filter((definition) => definition && typeof definition.route === "string" && definition.route.trim().length > 0)
    .map((definition, index) => {
      const routeLabel = definition.route.trim();
      const canonicalSet = resolveCanonicalRoutes(routeLabel);
      return {
        index,
        label: routeLabel,
        canonicalRoutes: canonicalSet,
        stages: Object.create(null),
      };
    });

  const routeDefinitionsByCanonical = new Map();
  for (const def of routeDefinitions) {
    for (const canonical of def.canonicalRoutes) {
      if (!routeDefinitionsByCanonical.has(canonical)) {
        routeDefinitionsByCanonical.set(canonical, []);
      }
      routeDefinitionsByCanonical.get(canonical).push(def);
    }
  }

  const generalStages = Object.create(null);
  const articleAmbiguousSegments = [];
  const articleRouteMismatches = new Map();

  for (const stageKey of STAGE_KEYS) {
    const rawValue = duration[stageKey];
    if (typeof rawValue !== "string") {
      continue;
    }

    const segments = splitDurationString(rawValue);

    for (const segment of segments) {
      const trimmedSegment = segment.trim();
      if (!trimmedSegment) {
        continue;
      }

      const { routes: detectedRoutes, cleanedValue } = parseDurationSegment(trimmedSegment, routeDetectionRules, routeRemovalPatterns);

      if (detectedRoutes.length === 0) {
        generalStages[stageKey] = mergeStageValue(generalStages[stageKey], cleanedValue);
        continue;
      }

      const unmatchedRoutes = [];
      const matchedDefinitions = new Set();
      let segmentAmbiguous = false;

      for (const route of detectedRoutes) {
        const candidates = routeDefinitionsByCanonical.get(route) ?? [];
        if (candidates.length === 0) {
          unmatchedRoutes.push(route);
          continue;
        }

        const refined = refineRouteMatches(candidates, cleanedValue, route);
        if (refined.length === 0) {
          unmatchedRoutes.push(route);
          continue;
        }

        if (refined.length > 1) {
          segmentAmbiguous = true;
          articleAmbiguousSegments.push({
            stage: stageKey,
            segment: trimmedSegment,
            reason: "multiple-route-definitions",
          });
          break;
        }

        matchedDefinitions.add(refined[0]);
      }

      if (unmatchedRoutes.length > 0) {
        articleRouteMismatches.set(stageKey, {
          stage: stageKey,
          segment: trimmedSegment,
          routes: unmatchedRoutes,
        });
      }

      if (segmentAmbiguous) {
        continue;
      }

      if (matchedDefinitions.size === 0) {
        articleAmbiguousSegments.push({
          stage: stageKey,
          segment: trimmedSegment,
          reason: "no-route-assignment",
        });
        continue;
      }

      for (const match of matchedDefinitions) {
        match.stages[stageKey] = mergeStageValue(match.stages[stageKey], cleanedValue);
      }
    }
  }

  const hasAmbiguity = articleAmbiguousSegments.length > 0;
  const hasMismatch = articleRouteMismatches.size > 0;

  if (hasAmbiguity || hasMismatch) {
    if (hasAmbiguity) {
      summaryCounts.skippedAmbiguous += 1;
      for (const entry of articleAmbiguousSegments) {
        ambiguousSegments.push({
          id: article.id ?? null,
          title: article.title ?? "",
          slug: slugify(article.title ?? ""),
          stage: entry.stage,
          segment: entry.segment,
          reason: entry.reason,
        });
      }
    }

    if (hasMismatch) {
      summaryCounts.skippedMismatched += 1;
      for (const [, mismatch] of articleRouteMismatches) {
        routeMismatchEntries.push({
          id: article.id ?? null,
          title: article.title ?? "",
          slug: slugify(article.title ?? ""),
          stage: mismatch.stage,
          segment: mismatch.segment,
          routes: mismatch.routes,
        });
      }
    }

    continue;
  }

  const routesWithStages = routeDefinitions.map((definition) => {
    const stages = buildCompleteStageMap(definition.stages, generalStages);
    return {
      route: definition.label,
      canonical_routes: definition.canonicalRoutes,
      stages,
    };
  });

  const structuredDuration = {
    ...(routeDefinitions.length === 0 && hasAnyStageValues(generalStages) ? { general: generalStages } : {}),
    routes_of_administration: routesWithStages.filter((definition) => hasAnyStageValues(definition.stages)),
  };

  if (!article.drug_info) {
    article.drug_info = {};
  }

  article.drug_info.duration = structuredDuration;
  summaryCounts.migrated += 1;
}

writeFileSync(OUTPUT_PATH, JSON.stringify(migratedArticles, null, 2));

writeFileSync(
  SKIP_LIST_PATH,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      ambiguous_segments: ambiguousSegments,
      route_mismatches: routeMismatchEntries,
      summary: summaryCounts,
    },
    null,
    2,
  ),
);

console.log(`Duration migration dry-run complete.`);
console.log(`  Migrated articles: ${summaryCounts.migrated}`);
console.log(`  Skipped (ambiguous): ${summaryCounts.skippedAmbiguous}`);
console.log(`  Skipped (route mismatches): ${summaryCounts.skippedMismatched}`);
console.log(`Output written to ${OUTPUT_PATH}`);
console.log(`Skip lists written to ${SKIP_LIST_PATH}`);

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function buildCompleteStageMap(routeStages, generalStages) {
  const completed = Object.create(null);
  for (const stageKey of STAGE_KEYS) {
    const specific = sanitizeStageValue(routeStages?.[stageKey]);
    const fallback = sanitizeStageValue(generalStages?.[stageKey]);
    const selected = specific || fallback;
    if (selected) {
      completed[stageKey] = selected;
    }
  }
  return completed;
}

function mergeStageValue(existing, next) {
  if (!next || next.length === 0) {
    return existing ?? "";
  }
  if (!existing || existing.length === 0) {
    return next;
  }
  if (existing.includes(next)) {
    return existing;
  }
  return `${existing}; ${next}`;
}

function sanitizeStageValue(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : "";
}

function hasAnyStageValues(stageMap) {
  if (!stageMap || typeof stageMap !== "object") {
    return false;
  }
  return STAGE_KEYS.some((stageKey) => {
    const raw = stageMap[stageKey];
    return typeof raw === "string" && raw.trim().length > 0;
  });
}

function splitDurationString(value) {
  const segments = [];
  let buffer = "";
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") {
      depth += 1;
    } else if (char === ")" && depth > 0) {
      depth -= 1;
    }

    const isSeparator = depth === 0 && (char === ";" || char === "|" || char === "\n" || char === "\u2022");
    const isCommaSeparator = depth === 0 && char === ",";

    if (isSeparator || isCommaSeparator) {
      segments.push(buffer);
      buffer = "";
      continue;
    }

    buffer += char;
  }

  if (buffer.trim().length > 0) {
    segments.push(buffer);
  }

  return segments;
}

function parseDurationSegment(segment, detectionRules, removalPatterns) {
  const lower = segment.toLowerCase();
  const detectedRoutes = new Set();

  for (const [route, patterns] of detectionRules.entries()) {
    for (const pattern of patterns) {
      if (pattern.test(lower)) {
        detectedRoutes.add(route);
        break;
      }
    }
  }

  const routes = Array.from(detectedRoutes);
  if (routes.length === 0) {
    return {
      routes,
      cleanedValue: segment.trim(),
    };
  }

  let cleaned = segment;

  cleaned = cleaned.replace(/\(([^()]*)\)/g, (match, inner) => {
    const innerLower = String(inner).toLowerCase();
    const matched = routes.every((route) =>
      detectionRules.get(route)?.some((pattern) => pattern.test(innerLower)),
    );
    if (matched) {
      return "";
    }
    return match;
  });

  for (const route of routes) {
    const patterns = removalPatterns.get(route) ?? [];
    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, " ");
    }
  }

  cleaned = cleaned
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([:/-])\s+/g, " $1 ")
    .replace(/^[\s,:;/-]+/, "")
    .replace(/[\s,:;/-]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    routes,
    cleanedValue: cleaned,
  };
}

function refineRouteMatches(candidates, segmentText, canonicalRoute) {
  if (candidates.length <= 1) {
    return candidates;
  }

  const loweredSegment = segmentText.toLowerCase();

  if (loweredSegment.includes("immediate release") || /\bir\b/.test(loweredSegment)) {
    const filtered = candidates.filter((candidate) => /immediate|\bir\b|instant/.test(candidate.label.toLowerCase()));
    if (filtered.length > 0) {
      return filtered;
    }
  }

  if (loweredSegment.includes("extended release") || /\ber\b|\bxr\b|sustained/.test(loweredSegment)) {
    const filtered = candidates.filter((candidate) => /extended|\ber\b|\bxr\b|sustained/.test(candidate.label.toLowerCase()));
    if (filtered.length > 0) {
      return filtered;
    }
  }

  if (loweredSegment.includes("patch") || loweredSegment.includes("topical")) {
    const filtered = candidates.filter((candidate) => /patch|transdermal|topical/.test(candidate.label.toLowerCase()));
    if (filtered.length > 0) {
      return filtered;
    }
  }

  if (loweredSegment.includes("spray")) {
    const filtered = candidates.filter((candidate) => /spray|nasal/.test(candidate.label.toLowerCase()));
    if (filtered.length > 0) {
      return filtered;
    }
  }

  if (loweredSegment.includes("inhal")) {
    const filtered = candidates.filter((candidate) => /inhal|smok|vapor/.test(candidate.label.toLowerCase()));
    if (filtered.length > 0) {
      return filtered;
    }
  }

  return candidates.length === 1 ? candidates : [];
}

function resolveCanonicalRoutes(descriptor) {
  const normalized = normalizeDescriptor(descriptor);
  if (!normalized) {
    return [];
  }

  const direct = normalizedSynonyms.get(normalized);
  if (direct) {
    return uniqueRoutes(direct);
  }

  const composite = splitCompositeDescriptor(normalized);
  if (composite) {
    const aggregate = [];
    for (const part of composite) {
      const resolved = resolveCanonicalRoutes(part);
      aggregate.push(...resolved);
    }
    return uniqueRoutes(aggregate);
  }

  const withoutParentheses = normalizeDescriptor(stripParenthetical(descriptor));
  if (withoutParentheses && withoutParentheses !== normalized) {
    const resolved = resolveCanonicalRoutes(withoutParentheses);
    if (resolved.length > 0) {
      return uniqueRoutes(resolved);
    }
  }

  return [];
}

function uniqueRoutes(list) {
  return list.filter((route, index) => list.indexOf(route) === index);
}

function normalizeDescriptor(value) {
  return String(value)
    .toLowerCase()
    .replace(/[\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/[•·]/g, " ")
    .replace(/[^a-z0-9/&+\s.-]/g, (match) => {
      if (match === "½") {
        return "1/2";
      }
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.-]+$/g, "");
}

function stripParenthetical(value) {
  return String(value).replace(/\([^)]*\)/g, " ");
}

function splitCompositeDescriptor(value) {
  if (value.includes("/")) {
    return value.split(/\s*\/\s*/).filter(Boolean);
  }
  if (value.includes(" and ")) {
    return value.split(/\s+and\s+/).filter(Boolean);
  }
  if (value.includes(" & ")) {
    return value.split(/\s*&\s*/).filter(Boolean);
  }
  if (value.includes(",")) {
    return value.split(/\s*,\s*/).filter(Boolean);
  }
  if (value.includes(" or ")) {
    return value.split(/\s+or\s+/).filter(Boolean);
  }
  if (value.includes(" vs ")) {
    return value.split(/\s+vs\s+/).filter(Boolean);
  }
  return undefined;
}

function buildSynonymMap(entries) {
  const map = new Map();
  for (const entry of entries) {
    const normalized = normalizeDescriptor(entry.match);
    const validRoutes = entry.routes.filter((route) => canonicalRoutes.includes(route));
    if (!normalized || validRoutes.length === 0) {
      continue;
    }
    if (!map.has(normalized)) {
      map.set(normalized, []);
    }
    const list = map.get(normalized);
    for (const route of validRoutes) {
      if (!list.includes(route)) {
        list.push(route);
      }
    }
  }
  return map;
}

function buildRouteDetectionRules() {
  const rules = new Map();
  rules.set("oral", [
    /\boral\b/,
    /\borally\b/,
    /\bper os\b/,
    /\bpo\b/,
    /\bp\.o\./,
    /\btablet\b(?=.*\boral\b)/,
  ]);
  rules.set("insufflated", [
    /\binsufflated\b/,
    /\binsufflation\b/,
    /\bsnorted\b/,
    /\bsnorting\b/,
    /\bnasal insufflation\b/,
  ]);
  rules.set("intranasal", [
    /\bintranasal\b/,
    /\bnasal spray\b/,
    /\bnasal administration\b/,
    /\bnasal dose\b/,
  ]);
  rules.set("sublingual", [
    /\bsublingual\b/,
    /\bunder the tongue\b/,
    /\bodt\b/,
  ]);
  rules.set("buccal", [
    /\bbuccal\b/,
    /\bcheek\b/,
  ]);
  rules.set("rectal", [
    /\brectal\b/,
    /\bplugged\b/,
    /\bboofed\b/,
    /\bsuppository\b/,
  ]);
  rules.set("vaporized", [
    /\bvaporized\b/,
    /\bvaporised\b/,
    /\bvaped\b/,
    /\bvaping\b/,
    /\bvaporizing\b/,
  ]);
  rules.set("smoked", [
    /\bsmoked\b/,
    /\bsmoking\b/,
    /\bsmoke\b/,
  ]);
  rules.set("inhaled", [
    /\binhaled\b/,
    /\binhalation\b/,
  ]);
  rules.set("intravenous", [
    /\bintravenous\b/,
    /\biv\b/,
    /\bi\.v\./,
  ]);
  rules.set("intramuscular", [
    /\bintramuscular\b/,
    /\bim\b/,
    /\bi\.m\./,
  ]);
  rules.set("subcutaneous", [
    /\bsubcutaneous\b/,
    /\bsubcut\b/,
    /\bsc\b/,
    /\bs\.c\./,
    /\bsub-q\b/,
  ]);
  rules.set("intrathecal", [
    /\bintrathecal\b/,
  ]);
  rules.set("transdermal", [
    /\btransdermal\b/,
    /\bpatch\b/,
    /\btopical\b/,
  ]);
  return rules;
}

function buildRouteRemovalPatterns() {
  const patterns = new Map();

  function add(route, expressions) {
    if (!patterns.has(route)) {
      patterns.set(route, []);
    }
    const list = patterns.get(route);
    for (const expression of expressions) {
      list.push(expression);
    }
  }

  add("oral", [
    /\boral\b/gi,
    /\borally\b/gi,
    /\bper os\b/gi,
    /\bpo\b/gi,
    /\bp\.o\./gi,
  ]);

  add("insufflated", [
    /\binsufflated\b/gi,
    /\binsufflation\b/gi,
    /\bsnorted\b/gi,
    /\bsnorting\b/gi,
    /\bnasal insufflation\b/gi,
  ]);

  add("intranasal", [
    /\bintranasal\b/gi,
    /\bnasal spray\b/gi,
    /\bnasal administration\b/gi,
    /\bnasal dose\b/gi,
  ]);

  add("sublingual", [
    /\bsublingual\b/gi,
    /\bunder the tongue\b/gi,
    /\bodt\b/gi,
  ]);

  add("buccal", [
    /\bbuccal\b/gi,
    /\bcheek\b/gi,
  ]);

  add("rectal", [
    /\brectal\b/gi,
    /\bplugged\b/gi,
    /\bboofed\b/gi,
    /\bsuppository\b/gi,
  ]);

  add("vaporized", [
    /\bvaporized\b/gi,
    /\bvaporised\b/gi,
    /\bvaped\b/gi,
    /\bvaping\b/gi,
    /\bvaporizing\b/gi,
  ]);

  add("smoked", [
    /\bsmoked\b/gi,
    /\bsmoking\b/gi,
    /\bsmoke\b/gi,
  ]);

  add("inhaled", [
    /\binhaled\b/gi,
    /\binhalation\b/gi,
  ]);

  add("intravenous", [
    /\bintravenous\b/gi,
    /\biv\b/gi,
    /\bi\.v\./gi,
  ]);

  add("intramuscular", [
    /\bintramuscular\b/gi,
    /\bim\b/gi,
    /\bi\.m\./gi,
  ]);

  add("subcutaneous", [
    /\bsubcutaneous\b/gi,
    /\bsubcut\b/gi,
    /\bsc\b/gi,
    /\bs\.c\./gi,
    /\bsub-q\b/gi,
  ]);

  add("intrathecal", [
    /\bintrathecal\b/gi,
  ]);

  add("transdermal", [
    /\btransdermal\b/gi,
    /\bpatch\b/gi,
    /\btopical\b/gi,
  ]);

  return patterns;
}
