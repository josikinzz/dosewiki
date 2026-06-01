import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

import { transformDoseRanges } from "../prepopulate/dosage-duration/dosage.mjs";
import { transformStages } from "../prepopulate/dosage-duration/duration.mjs";
import { normalizeRoute, normalizeUnit } from "../prepopulate/dosage-duration/normalize.mjs";
import { dedupeStrings } from "./formal-citations-source-utils.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");
const PARSED_SOURCES_PATH = join(PROJECT_ROOT, "src/data/parsed-sources.json");

let cachedParsedSources = null;

function loadParsedSources() {
  if (!cachedParsedSources) {
    cachedParsedSources = JSON.parse(readFileSync(PARSED_SOURCES_PATH, "utf8"));
  }
  return cachedParsedSources;
}

export function resolveParsedSourceSubstance(articleSlug) {
  if (!articleSlug) return null;
  return loadParsedSources()?.substances?.[articleSlug] ?? null;
}

function normalizeDoseTier(tier) {
  if (!tier) return { min: null, max: null, unit: "mg" };
  return {
    min: tier.min ?? null,
    max: tier.max ?? null,
    unit: normalizeUnit(tier.unit),
  };
}

function normalizeDosageTierMap(route) {
  const doseRanges = route?.dose_ranges ?? {};
  return {
    threshold: normalizeDoseTier(doseRanges.threshold),
    light: normalizeDoseTier(doseRanges.light),
    moderate: normalizeDoseTier(doseRanges.moderate ?? doseRanges.common),
    strong: normalizeDoseTier(doseRanges.strong),
    heavy: normalizeDoseTier(doseRanges.heavy),
  };
}

function normalizeDurationStage(stage) {
  if (!stage) return { min: null, max: null, unit: "hours" };
  return {
    min: stage.min ?? null,
    max: stage.max ?? null,
    unit: normalizeUnit(stage.unit),
  };
}

function normalizeDurationStageMap(route) {
  const stages = route?.stages ?? {};
  return {
    onset: normalizeDurationStage(stages.onset),
    come_up: normalizeDurationStage(stages.come_up),
    peak: normalizeDurationStage(stages.peak),
    offset: normalizeDurationStage(stages.offset),
    after_effects: normalizeDurationStage(stages.after_effects),
    total_duration: normalizeDurationStage(stages.total_duration),
  };
}

function compareNumericField(leftValue, rightValue) {
  if (leftValue == null && rightValue == null) {
    return { kind: "both_empty", matches: true };
  }
  if (leftValue == null || rightValue == null) {
    return { kind: "missing", matches: false };
  }

  const delta = Math.abs(leftValue - rightValue);
  const tolerance = Math.max(0.25, Math.max(Math.abs(leftValue), Math.abs(rightValue)) * 0.05);
  return {
    kind: delta <= tolerance ? "exactish" : "mismatch",
    matches: delta <= tolerance,
    delta,
  };
}

function scoreDoseRouteMatch(articleRoute, candidateEntry) {
  const articleRanges = normalizeDosageTierMap(articleRoute);
  const candidateRanges = normalizeDosageTierMap({ dose_ranges: transformDoseRanges(candidateEntry.ranges) });
  const tiers = ["threshold", "light", "moderate", "strong", "heavy"];
  const compared = [];
  let matchedCells = 0;
  let comparedCells = 0;
  let unitMismatch = false;

  for (const tier of tiers) {
    for (const bound of ["min", "max"]) {
      const articleValue = articleRanges[tier]?.[bound] ?? null;
      const candidateValue = candidateRanges[tier]?.[bound] ?? null;
      const articleUnit = articleRanges[tier]?.unit ?? "mg";
      const candidateUnit = candidateRanges[tier]?.unit ?? "mg";

      if (articleValue == null && candidateValue == null) continue;
      comparedCells += 1;

      if (articleUnit !== candidateUnit) {
        unitMismatch = true;
      }

      const comparison = compareNumericField(articleValue, candidateValue);
      if (comparison.matches) {
        matchedCells += 1;
      }

      compared.push({
        field: `${tier}.${bound}`,
        articleValue,
        candidateValue,
        articleUnit,
        candidateUnit,
        comparison: comparison.kind,
      });
    }
  }

  return {
    sourceId: candidateEntry.source,
    route: normalizeRoute(candidateEntry.route),
    unitMismatch,
    comparedCells,
    matchedCells,
    score: comparedCells > 0 ? matchedCells / comparedCells : 0,
    compared,
  };
}

function scoreDurationRouteMatch(articleRoute, candidateEntry) {
  const articleStages = normalizeDurationStageMap(articleRoute);
  const candidateStages = normalizeDurationStageMap({ stages: transformStages(candidateEntry.stages) });
  const stageNames = ["onset", "come_up", "peak", "offset", "after_effects", "total_duration"];
  const compared = [];
  let matchedCells = 0;
  let comparedCells = 0;
  let unitMismatch = false;

  for (const stage of stageNames) {
    for (const bound of ["min", "max"]) {
      const articleValue = articleStages[stage]?.[bound] ?? null;
      const candidateValue = candidateStages[stage]?.[bound] ?? null;
      const articleUnit = articleStages[stage]?.unit ?? "hours";
      const candidateUnit = candidateStages[stage]?.unit ?? "hours";

      if (articleValue == null && candidateValue == null) continue;
      comparedCells += 1;

      if (articleUnit !== candidateUnit) {
        unitMismatch = true;
      }

      const comparison = compareNumericField(articleValue, candidateValue);
      if (comparison.matches) {
        matchedCells += 1;
      }

      compared.push({
        field: `${stage}.${bound}`,
        articleValue,
        candidateValue,
        articleUnit,
        candidateUnit,
        comparison: comparison.kind,
      });
    }
  }

  return {
    sourceId: candidateEntry.source,
    route: normalizeRoute(candidateEntry.route),
    unitMismatch,
    comparedCells,
    matchedCells,
    score: comparedCells > 0 ? matchedCells / comparedCells : 0,
    compared,
  };
}

export function buildDosageDurationMatcherResults({ article, parsedSubstance }) {
  if (!parsedSubstance) {
    return {
      selectedSourceIds: [],
      dosage: [],
      duration: [],
    };
  }

  const dosage = [];
  for (const route of article?.dosage?.routes ?? []) {
    const normalizedRoute = normalizeRoute(route.route);
    const candidates = (parsedSubstance.dosage ?? [])
      .filter((entry) => normalizeRoute(entry.route) === normalizedRoute)
      .map((entry) => scoreDoseRouteMatch(route, entry))
      .sort((left, right) => right.score - left.score || left.unitMismatch - right.unitMismatch);

    dosage.push({
      route: normalizedRoute,
      selectedSourceId: candidates[0]?.sourceId ?? null,
      accepted: Boolean(candidates[0] && !candidates[0].unitMismatch && candidates[0].score >= 0.7),
      candidates,
    });
  }

  const duration = [];
  for (const route of article?.duration?.routes ?? []) {
    const normalizedRoute = normalizeRoute(route.route);
    const candidates = (parsedSubstance.duration ?? [])
      .filter((entry) => normalizeRoute(entry.route) === normalizedRoute)
      .map((entry) => scoreDurationRouteMatch(route, entry))
      .sort((left, right) => right.score - left.score || left.unitMismatch - right.unitMismatch);

    duration.push({
      route: normalizedRoute,
      selectedSourceId: candidates[0]?.sourceId ?? null,
      accepted: Boolean(candidates[0] && !candidates[0].unitMismatch && candidates[0].score >= 0.7),
      candidates,
    });
  }

  return {
    selectedSourceIds: dedupeStrings([
      ...dosage.map((entry) => entry.selectedSourceId),
      ...duration.map((entry) => entry.selectedSourceId),
    ]),
    dosage,
    duration,
  };
}
