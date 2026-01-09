import fs from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';

/**
 * Export Dose Spreadsheet - Updated for SubstanceArticle Schema
 *
 * Exports dosage and duration data from articles.json to Excel format.
 *
 * SubstanceArticle schema structure:
 * - article.identification.common_name (string)
 * - article.dosage.routes[].route (string)
 * - article.dosage.routes[].dose_ranges.{threshold,light,moderate,strong,heavy} ({ min, max, unit })
 * - article.duration.routes[].route (string)
 * - article.duration.routes[].stages.{onset,peak,offset,...} ({ min, max, unit })
 */

const routeSynonymData = JSON.parse(
  fs.readFileSync(new URL('../../src/data/mappings/routeSynonyms.json', import.meta.url), 'utf8'),
);

const CANONICAL_ROUTES = routeSynonymData.canonicalRoutes ?? [];

const STOP_WORDS = [
  'route',
  'routes',
  'administration',
  'administrations',
  'administered',
  'administering',
  'use',
  'usage',
  'only',
  'form',
  'forms',
  'via',
];

const COMPOSITE_SEPARATORS = [
  { test: /\//, split: /\s*\/\s*/ },
  { test: /\band\b/, split: /\s+and\s+/ },
  { test: /\b&\b/, split: /\s*&\s*/ },
  { test: /\bplus\b/, split: /\s+plus\s+/ },
  { test: /\bwith\b/, split: /\s+with\s+/ },
  { test: /\bor\b/, split: /\s+or\s+/ },
  { test: /,/, split: /\s*,\s*/ },
  { test: /\bvs\.?\b/, split: /\s+vs\.?\s+/ },
];

const DURATION_STAGE_KEYS = [
  'total_duration',
  'onset',
  'come_up',
  'peak',
  'offset',
  'after_effects',
];

const DURATION_LABELS = {
  total_duration: 'Total',
  onset: 'Onset',
  come_up: 'Come-up',
  peak: 'Peak',
  offset: 'Offset',
  after_effects: 'After effects',
};

const COLUMN_DEFINITIONS = [
  { key: 'substanceName', label: 'Substance' },
  { key: 'slug', label: 'Slug' },
  { key: 'articleId', label: 'Article ID' },
  { key: 'routeLabel', label: 'Route Label' },
  { key: 'canonicalRoutes', label: 'Canonical Routes' },
  { key: 'units', label: 'Units' },
  { key: 'threshold', label: 'Threshold' },
  { key: 'light', label: 'Light' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'strong', label: 'Strong' },
  { key: 'heavy', label: 'Heavy' },
  { key: 'dosageNote', label: 'Dosage Note' },
  { key: 'durationSummary', label: 'Duration Summary' },
];

const MATRIX_ROW_DEFINITIONS = [
  { key: 'threshold', label: 'Threshold', getter: (route) => route.doses.threshold },
  { key: 'light', label: 'Light', getter: (route) => route.doses.light },
  { key: 'moderate', label: 'Moderate', getter: (route) => route.doses.moderate },
  { key: 'strong', label: 'Strong', getter: (route) => route.doses.strong },
  { key: 'heavy', label: 'Heavy', getter: (route) => route.doses.heavy },
];

const DOSE_KEYS = ['threshold', 'light', 'moderate', 'strong', 'heavy'];

const ROUTE_CANONICAL_MERGE_MAP = new Map([
  ['intranasal', 'insufflated'],
  ['vaporized / inhaled', 'vaporized'],
  ['vaporized/inhaled', 'vaporized'],
  ['vaporized / smoked / inhaled', 'vaporized'],
  ['vaporized/smoked/inhaled', 'vaporized'],
  ['vaporized / smoked', 'vaporized'],
  ['vaporized/smoked', 'vaporized'],
  ['smoked / vaporized', 'vaporized'],
  ['smoked/vaporized', 'vaporized'],
]);

const canonicalOrderIndex = new Map(CANONICAL_ROUTES.map((route, index) => [route, index]));

function sortCanonicalRouteList(routes) {
  if (!Array.isArray(routes)) {
    return [];
  }

  return routes
    .slice()
    .filter((route) => typeof route === 'string' && route.trim().length > 0)
    .sort((a, b) => {
      const indexA = canonicalOrderIndex.get(a) ?? Number.MAX_SAFE_INTEGER;
      const indexB = canonicalOrderIndex.get(b) ?? Number.MAX_SAFE_INTEGER;
      if (indexA !== indexB) {
        return indexA - indexB;
      }
      return a.localeCompare(b, 'en', { sensitivity: 'base' });
    });
}

function normalizeWhitespace(value) {
  return value
    .replace(/[\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripParenthetical(value) {
  return normalizeWhitespace(value.replace(/\([^)]*\)/g, ' '));
}

function normalizeRouteTokenInternal(value) {
  if (!value) {
    return '';
  }

  const lower = String(value)
    .toLowerCase()
    .replace(/[\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/[•·]/g, ' ')
    .replace(/[^a-z0-9/&+\s.-]/g, (match) => {
      if (match === '½') {
        return '1/2';
      }
      return ' ';
    });

  const collapsed = lower.replace(/\s+/g, ' ').trim();
  return collapsed.replace(/[.-]+$/g, '');
}

function normalizeRouteToken(value) {
  return normalizeRouteTokenInternal(value);
}

function stripStopWords(value) {
  const tokens = value.split(' ').filter(Boolean);
  while (tokens.length > 0 && STOP_WORDS.includes(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(' ');
}

function uniqueRoutes(routes) {
  return routes.filter((route, index, list) => list.indexOf(route) === index);
}

function mergeCanonicalRoutes(routes) {
  if (!Array.isArray(routes)) {
    return [];
  }

  const mapped = routes.map((route) => ROUTE_CANONICAL_MERGE_MAP.get(route) ?? route);
  return sortCanonicalRouteList(uniqueRoutes(mapped));
}

function splitComposite(normalized) {
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

const synonymEntries = (routeSynonymData.synonyms ?? []).map((entry) => {
  const normalized = normalizeRouteTokenInternal(entry.match);
  const routes = (entry.routes ?? []).filter((route) => CANONICAL_ROUTES.includes(route));
  return {
    match: entry.match,
    routes,
    normalized,
  };
});

const synonymMap = new Map();
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

function resolveDirect(normalized) {
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

function resolveCanonicalRoutes(descriptor) {
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
    const aggregate = [];
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

function canonicalizeRouteLabel(label) {
  return {
    canonicalRoutes: resolveCanonicalRoutes(label),
    normalized: normalizeRouteTokenInternal(label),
  };
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}

function toTrimmedString(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function nonEmpty(value) {
  const trimmed = toTrimmedString(value);
  return trimmed.length > 0 ? trimmed : '';
}

/**
 * Format a structured dose range { min, max, unit } to a display string.
 */
function formatDoseRange(doseRange) {
  if (!doseRange || typeof doseRange !== 'object') {
    return '';
  }

  const { min, max, unit } = doseRange;
  const unitStr = nonEmpty(unit);

  if (min != null && max != null) {
    if (min === max) {
      return unitStr ? `${min} ${unitStr}` : `${min}`;
    }
    return unitStr ? `${min}-${max} ${unitStr}` : `${min}-${max}`;
  }
  if (min != null) {
    return unitStr ? `${min}+ ${unitStr}` : `${min}+`;
  }
  if (max != null) {
    return unitStr ? `<${max} ${unitStr}` : `<${max}`;
  }
  return '';
}

/**
 * Extract unit from dose ranges (first non-empty unit found).
 */
function extractUnit(doseRanges) {
  if (!doseRanges || typeof doseRanges !== 'object') {
    return '';
  }

  for (const key of DOSE_KEYS) {
    const range = doseRanges[key];
    if (range?.unit) {
      return nonEmpty(range.unit);
    }
  }
  return '';
}

/**
 * Format a structured duration stage { min, max, unit } to a display string.
 */
function formatDurationStage(stage) {
  if (!stage || typeof stage !== 'object') {
    return '';
  }

  const { min, max, unit } = stage;
  const unitStr = nonEmpty(unit);

  if (min != null && max != null) {
    if (min === max) {
      return unitStr ? `${min} ${unitStr}` : `${min}`;
    }
    return unitStr ? `${min}-${max} ${unitStr}` : `${min}-${max}`;
  }
  if (min != null) {
    return unitStr ? `${min}+ ${unitStr}` : `${min}+`;
  }
  if (max != null) {
    return unitStr ? `<${max} ${unitStr}` : `<${max}`;
  }
  return '';
}

/**
 * Find matching duration route for a given route label.
 */
function findDurationRoute(durationRoutes, routeLabel, canonicalRoutes) {
  if (!Array.isArray(durationRoutes) || durationRoutes.length === 0) {
    return null;
  }

  const normalizedTarget = normalizeRouteTokenInternal(routeLabel);
  const canonicalSet = new Set((canonicalRoutes ?? []).map((r) => r.toLowerCase()));

  // Try to find exact match
  for (const durationRoute of durationRoutes) {
    const durationRouteLabel = normalizeRouteTokenInternal(durationRoute?.route);
    if (durationRouteLabel && durationRouteLabel === normalizedTarget) {
      return durationRoute;
    }

    // Check canonical routes match
    const durationCanonical = resolveCanonicalRoutes(durationRoute?.route || '');
    for (const canonical of durationCanonical) {
      if (canonicalSet.has(canonical.toLowerCase())) {
        return durationRoute;
      }
    }
  }

  // Fallback to first route if no match
  return durationRoutes[0];
}

/**
 * Build duration summary from duration route stages.
 */
function buildDurationSummary(durationRoute) {
  if (!durationRoute?.stages) {
    return '';
  }

  const stages = durationRoute.stages;
  const parts = [];

  for (const key of DURATION_STAGE_KEYS) {
    const stage = stages[key];
    const formatted = formatDurationStage(stage);
    if (formatted) {
      const label = DURATION_LABELS[key] ?? key;
      parts.push(`${label}: ${formatted}`);
    }
  }

  return parts.join(' · ');
}

async function loadArticles(datasetPath) {
  const raw = await readFile(datasetPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    return parsed;
  }

  return Object.values(parsed);
}

function computeRouteScore(routeData) {
  let score = 0;
  if (routeData.units) {
    score += 1;
  }
  for (const key of DOSE_KEYS) {
    if (routeData.doses[key]) {
      score += 1;
    }
  }
  return score;
}

function getRouteOrderRank(routeDefinition) {
  const indices = (routeDefinition.canonicalRoutes ?? [])
    .map((route) => canonicalOrderIndex.get(route))
    .filter((index) => index !== undefined);
  if (indices.length > 0) {
    return Math.min(...indices);
  }
  return Number.MAX_SAFE_INTEGER;
}

function sortRouteDefinitions(a, b) {
  const rankA = getRouteOrderRank(a);
  const rankB = getRouteOrderRank(b);
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  return a.displayLabel.localeCompare(b.displayLabel, 'en', { sensitivity: 'base' });
}

function valueOrDash(value) {
  const trimmed = toTrimmedString(value);
  return trimmed.length > 0 ? trimmed : '-';
}

function createMatrixData(substances, sortedRoutes) {
  const header = ['ROA', 'Drug', 'Dose Unit', 'Dose Amount', 'Intensity Level'];
  const matrix = [header];

  for (const substance of substances) {
    for (const routeDefinition of sortedRoutes) {
      const routeData = substance.routes.get(routeDefinition.key);
      if (!routeData) {
        continue;
      }

      const unitsDisplay = valueOrDash(routeData.units);

      for (const rowDefinition of MATRIX_ROW_DEFINITIONS) {
        const amount = valueOrDash(rowDefinition.getter(routeData));
        matrix.push([
          routeDefinition.displayLabel,
          substance.substanceName,
          unitsDisplay,
          amount,
          rowDefinition.label,
        ]);
      }
    }
  }

  return matrix;
}

function createFlatRows(substances, routeOrderIndex) {
  const rows = [];

  for (const substance of substances) {
    const orderedRoutes = Array.from(substance.routes.values()).sort((a, b) => {
      const indexA = routeOrderIndex.get(a.key) ?? Number.MAX_SAFE_INTEGER;
      const indexB = routeOrderIndex.get(b.key) ?? Number.MAX_SAFE_INTEGER;
      if (indexA !== indexB) {
        return indexA - indexB;
      }
      return a.displayLabel.localeCompare(b.displayLabel, 'en', { sensitivity: 'base' });
    });

    if (orderedRoutes.length === 0) {
      rows.push({
        substanceName: substance.substanceName,
        slug: substance.slug,
        articleId: substance.articleId,
        routeLabel: '',
        canonicalRoutes: '',
        units: '',
        threshold: '',
        light: '',
        moderate: '',
        strong: '',
        heavy: '',
        dosageNote: '',
        durationSummary: '',
      });
      continue;
    }

    for (const route of orderedRoutes) {
      rows.push({
        substanceName: substance.substanceName,
        slug: substance.slug,
        articleId: substance.articleId,
        routeLabel: route.originalLabel || route.displayLabel,
        canonicalRoutes: route.canonicalRoutes.join(', '),
        units: route.units,
        threshold: route.doses.threshold,
        light: route.doses.light,
        moderate: route.doses.moderate,
        strong: route.doses.strong,
        heavy: route.doses.heavy,
        dosageNote: route.dosageNote || '',
        durationSummary: route.durationSummary,
      });
    }
  }

  return rows;
}

async function main() {
  const root = process.cwd();
  const articlesPath = path.join(root, 'src/data/articles.json');
  const outputDir = path.join(root, 'notes and plans/exports');
  const outputPath = path.join(outputDir, 'dose-equivalent-table.xlsx');

  await mkdir(outputDir, { recursive: true });

  const articles = await loadArticles(articlesPath);
  const substances = [];
  const routeDefinitions = new Map();
  const warnings = [];

  for (const article of articles) {
    if (!article || typeof article !== 'object') {
      continue;
    }

    const articleId = typeof article.id === 'number' ? article.id : '';

    // SubstanceArticle schema: identification.common_name
    const identification = article.identification || {};
    const substanceName = nonEmpty(identification.common_name) || nonEmpty(article.title) || 'Unknown substance';
    const slug = substanceName ? slugify(substanceName) : '';

    // SubstanceArticle schema: dosage.routes[]
    const dosage = article.dosage || {};
    const rawRoutes = Array.isArray(dosage.routes)
      ? dosage.routes.filter((route) => route && typeof route === 'object')
      : [];

    // SubstanceArticle schema: duration.routes[]
    const duration = article.duration || {};
    const durationRoutes = Array.isArray(duration.routes) ? duration.routes : [];

    const substanceEntry = {
      substanceName,
      slug,
      articleId,
      routes: new Map(),
    };

    if (rawRoutes.length === 0) {
      warnings.push(`No dosage routes for ${substanceName}`);
      substances.push(substanceEntry);
      continue;
    }

    for (const route of rawRoutes) {
      const routeLabel = nonEmpty(route.route);
      if (!routeLabel) {
        warnings.push(`Missing route label for ${substanceName}`);
        continue;
      }

      const canonical = canonicalizeRouteLabel(routeLabel);
      const originalNormalized = canonical.normalized;
      const mergeTarget = ROUTE_CANONICAL_MERGE_MAP.get(originalNormalized);
      const canonicalRoutesBase = sortCanonicalRouteList(canonical.canonicalRoutes);
      let canonicalRoutes = mergeTarget
        ? [mergeTarget]
        : mergeCanonicalRoutes(canonicalRoutesBase);
      if (!mergeTarget && canonicalRoutes.includes('vaporized')) {
        const hasInhaled = canonicalRoutes.includes('inhaled');
        const hasSmoked = canonicalRoutes.includes('smoked');
        if (hasInhaled || hasSmoked) {
          canonicalRoutes = ['vaporized'];
        }
      }
      const mergedNormalized = mergeTarget ?? originalNormalized;
      const routeKeySource = canonicalRoutes.length > 0 ? canonicalRoutes.join(' / ') : mergedNormalized || routeLabel;
      const routeKey = nonEmpty(routeKeySource);
      if (!routeKey) {
        continue;
      }

      const displayLabel = canonicalRoutes.length > 0 ? canonicalRoutes.join(' / ') : mergedNormalized || routeLabel;

      if (!routeDefinitions.has(routeKey)) {
        routeDefinitions.set(routeKey, {
          key: routeKey,
          displayLabel,
          canonicalRoutes,
        });
      }

      // SubstanceArticle schema: dose_ranges are structured { min, max, unit }
      const doseRanges = route.dose_ranges || {};
      const units = extractUnit(doseRanges);

      // Find matching duration route
      const matchingDurationRoute = findDurationRoute(durationRoutes, routeLabel, canonicalRoutes);
      const durationSummary = buildDurationSummary(matchingDurationRoute);

      const routeData = {
        key: routeKey,
        displayLabel,
        canonicalRoutes,
        originalLabel: routeLabel,
        units,
        doses: {
          threshold: formatDoseRange(doseRanges.threshold),
          light: formatDoseRange(doseRanges.light),
          moderate: formatDoseRange(doseRanges.moderate),
          strong: formatDoseRange(doseRanges.strong),
          heavy: formatDoseRange(doseRanges.heavy),
        },
        dosageNote: nonEmpty(route.notes),
        durationSummary,
      };
      routeData.score = computeRouteScore(routeData);

      const existing = substanceEntry.routes.get(routeKey);
      if (!existing || routeData.score > existing.score) {
        substanceEntry.routes.set(routeKey, routeData);
      }
    }

    if (substanceEntry.routes.size === 0) {
      warnings.push(`No dosage routes for ${substanceName}`);
    } else {
      for (const routeData of substanceEntry.routes.values()) {
        const missingBuckets = DOSE_KEYS.filter((key) => !routeData.doses[key]);
        if (missingBuckets.length > 0) {
          warnings.push(
            `Missing ${missingBuckets.join(', ')} for ${substanceName} (${routeData.originalLabel})`,
          );
        }
        if (!routeData.units) {
          warnings.push(`Missing units for ${substanceName} (${routeData.originalLabel})`);
        }
      }
    }

    substances.push(substanceEntry);
  }

  substances.sort((a, b) => a.substanceName.localeCompare(b.substanceName, 'en', { sensitivity: 'base' }));

  const sortedRouteDefinitions = Array.from(routeDefinitions.values()).sort(sortRouteDefinitions);
  const routeOrderIndex = new Map(sortedRouteDefinitions.map((route, index) => [route.key, index]));

  const matrixData = createMatrixData(substances, sortedRouteDefinitions);
  const flatRows = createFlatRows(substances, routeOrderIndex);

  const flatHeader = COLUMN_DEFINITIONS.map((column) => column.label);
  const flatDataRows = flatRows.map((row) => COLUMN_DEFINITIONS.map((column) => row[column.key] ?? ''));

  const matrixSheet = XLSX.utils.aoa_to_sheet(matrixData);
  matrixSheet['!cols'] = [
    { wch: 20 },
    { wch: 28 },
    { wch: 12 },
    { wch: 18 },
    { wch: 14 },
  ];

  const flatSheet = XLSX.utils.aoa_to_sheet([flatHeader, ...flatDataRows]);
  flatSheet['!cols'] = [
    { wch: 28 },
    { wch: 24 },
    { wch: 10 },
    { wch: 24 },
    { wch: 26 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 50 },
    { wch: 60 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, matrixSheet, 'Dose Matrix');
  XLSX.utils.book_append_sheet(workbook, flatSheet, 'Dose Tables');
  XLSX.writeFile(workbook, outputPath);

  console.log(
    `Exported ${sortedRouteDefinitions.length} routes across ${substances.length} substances to ${path.relative(
      root,
      outputPath,
    )}`,
  );
  console.log(`Flat table rows: ${flatRows.length}`);

  if (warnings.length > 0) {
    const uniqueWarnings = Array.from(new Set(warnings));
    console.log(`Warnings (${uniqueWarnings.length}):`);
    for (const warning of uniqueWarnings) {
      console.log(`  - ${warning}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
