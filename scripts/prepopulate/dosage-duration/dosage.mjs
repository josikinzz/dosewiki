import { DOSE_LEVEL_MAP } from "./config.mjs";
import { cleanBioavailability, getSourcePriority, normalizeRoute, normalizeUnit } from "./normalize.mjs";

function isWeightUnit(unit) { if (!unit) return true;
const normalized = unit.toLowerCase();
return [
  "mg",
  "g",
  "grams",
  "gram",
  "µg",
  "ug",
  "mcg",
  "micrograms",
  "microgram",
  "milligrams",
  "milligram",
].includes(normalized); }

export function getComparableUpperBound(ranges) {
  if (!ranges) return { value: Infinity, isWeight: true };

  const heavy = ranges.heavy;
  const strong = ranges.strong;
  const common = ranges.common;

  let value = null;
  let unit = "mg";

  if (heavy?.min != null) {
    value = heavy.min;
    unit = heavy.unit;
  } else if (strong?.max != null) {
    value = strong.max;
    unit = strong.unit;
  } else if (strong?.min != null) {
    value = strong.min;
    unit = strong.unit;
  } else if (common?.max != null) {
    value = common.max;
    unit = common.unit;
  }

  if (value == null) return { value: Infinity, isWeight: true };
  if (!isWeightUnit(unit)) {
    return { value, isWeight: false, unit };
  }

  const normalized = (unit || "mg").toLowerCase();
  if (["µg", "ug", "mcg", "microgram", "micrograms"].includes(normalized)) {
    value /= 1000;
  } else if (["g", "grams", "gram"].includes(normalized)) {
    value *= 1000;
  }

  return { value, isWeight: true };
}

function countFilledDoseTiers(ranges) { if (!ranges) return 0;
return ["threshold", "light", "common", "strong", "heavy"]
  .filter((tier) => ranges[tier]?.min != null || ranges[tier]?.max != null)
  .length; }

export function selectSafestDoseSource(entriesForRoute) {
  if (!entriesForRoute?.length) return null;

  const weighted = entriesForRoute.filter((entry) => getComparableUpperBound(entry.ranges).isWeight);

  if (weighted.length === 0) {
    return [...entriesForRoute].sort(
      (a, b) => getSourcePriority(a.source) - getSourcePriority(b.source),
    )[0];
  }

  return [...weighted].sort((a, b) => {
    const aUpper = getComparableUpperBound(a.ranges).value;
    const bUpper = getComparableUpperBound(b.ranges).value;

    if (aUpper !== bUpper) return aUpper - bUpper;
    return countFilledDoseTiers(b.ranges) - countFilledDoseTiers(a.ranges);
  })[0];
}

function transformDoseRange(range) { if (!range) return { min: null, max: null, unit: "mg" };
return {
  min: range.min ?? null,
  max: range.max ?? null,
  unit: normalizeUnit(range.unit),
}; }

export function transformDoseRanges(ranges) {
  const result = {
    threshold: { min: null, max: null, unit: "mg" },
    light: { min: null, max: null, unit: "mg" },
    moderate: { min: null, max: null, unit: "mg" },
    strong: { min: null, max: null, unit: "mg" },
    heavy: { min: null, max: null, unit: "mg" },
  };

  if (!ranges) return result;

  let defaultUnit = "mg";
  for (const level of Object.values(ranges)) {
    if (level?.unit) {
      defaultUnit = normalizeUnit(level.unit);
      break;
    }
  }

  for (const key of Object.keys(result)) {
    result[key].unit = defaultUnit;
  }

  for (const [sourceLevel, targetLevel] of Object.entries(DOSE_LEVEL_MAP)) {
    if (ranges[sourceLevel]) {
      result[targetLevel] = transformDoseRange(ranges[sourceLevel]);
    }
  }

  if (result.threshold.min == null && result.threshold.max == null && result.light.min != null) {
    result.threshold.min = result.light.min;
    result.threshold.unit = result.light.unit;
  }

  if (result.heavy.min == null && result.heavy.max == null && result.strong.max != null) {
    result.heavy.min = result.strong.max;
    result.heavy.unit = result.strong.unit;
  }

  return result;
}

function tierHasData(tier) { if (!tier) return false;
return tier.min != null || tier.max != null; }

export function mergeDoseTiers(entriesForRoute) {
  if (!entriesForRoute?.length) return null;

  const base = selectSafestDoseSource(entriesForRoute);
  if (!base) return null;

  const mergedRanges = JSON.parse(JSON.stringify(base.ranges || {}));
  const tierLevels = ["threshold", "light", "common", "strong", "heavy"];
  const others = entriesForRoute
    .filter((entry) => entry !== base)
    .sort((a, b) => countFilledDoseTiers(b.ranges) - countFilledDoseTiers(a.ranges));

  for (const entry of others) {
    if (!entry.ranges) continue;
    for (const tier of tierLevels) {
      if (!tierHasData(mergedRanges[tier]) && tierHasData(entry.ranges[tier])) {
        mergedRanges[tier] = entry.ranges[tier];
      }
    }
  }

  return {
    ...base,
    ranges: mergedRanges,
    mergedFrom: [base.source, ...others.map((entry) => entry.source)],
  };
}

export function selectBestDosagePerRoute(dosageEntries) {
  if (!dosageEntries?.length) return [];

  const byRoute = new Map();
  for (const entry of dosageEntries) {
    const route = normalizeRoute(entry.route);
    if (!byRoute.has(route)) {
      byRoute.set(route, []);
    }
    byRoute.get(route).push(entry);
  }

  const bySource = new Map();
  for (const entry of dosageEntries) {
    if (!bySource.has(entry.source)) {
      bySource.set(entry.source, []);
    }
    bySource.get(entry.source).push(entry);
  }

  const sortedSources = Array.from(bySource.keys()).sort(
    (a, b) => getSourcePriority(a) - getSourcePriority(b),
  );
  const primaryRoutes = (bySource.get(sortedSources[0]) || []).map((entry) => normalizeRoute(entry.route));

  const result = [];
  const added = new Set();

  for (const route of primaryRoutes) {
    if (byRoute.has(route) && !added.has(route)) {
      const merged = mergeDoseTiers(byRoute.get(route));
      if (merged) {
        result.push(merged);
        added.add(route);
      }
    }
  }

  for (const [route, entries] of byRoute) {
    if (!added.has(route)) {
      const merged = mergeDoseTiers(entries);
      if (merged) {
        result.push(merged);
        added.add(route);
      }
    }
  }

  return result;
}

export function transformDosage(parsedDosage) {
  if (!parsedDosage?.length) {
    return { routes: [], plateau_dosing: null };
  }

  const bestEntries = selectBestDosagePerRoute(parsedDosage);

  return {
    routes: bestEntries.map((entry) => ({
      route: normalizeRoute(entry.route),
      bioavailability: cleanBioavailability(entry.bioavailability),
      dose_ranges: transformDoseRanges(entry.ranges),
      notes: entry.notes || "",
    })),
    plateau_dosing: null,
  };
}
