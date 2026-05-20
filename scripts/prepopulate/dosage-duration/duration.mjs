import { DURATION_STAGE_MAP } from "./config.mjs";
import { getDurationSourcePriority, normalizeRoute, normalizeUnit } from "./normalize.mjs";

export function transformDurationStage(stage) {
  if (!stage) return { min: null, max: null, unit: "minutes" };
  return {
    min: stage.min ?? null,
    max: stage.max ?? null,
    unit: normalizeUnit(stage.unit),
  };
}

export function transformStages(stages) {
  const result = {
    onset: { min: null, max: null, unit: "minutes" },
    come_up: { min: null, max: null, unit: "minutes" },
    peak: { min: null, max: null, unit: "hours" },
    offset: { min: null, max: null, unit: "hours" },
    after_effects: { min: null, max: null, unit: "hours" },
    total_duration: { min: null, max: null, unit: "hours" },
  };

  if (!stages) return result;

  for (const [sourceStage, targetStage] of Object.entries(DURATION_STAGE_MAP)) {
    if (stages[sourceStage]) {
      result[targetStage] = transformDurationStage(stages[sourceStage]);
    }
  }

  return result;
}

export function countFilledDurationFields(stages) {
  if (!stages) return 0;
  let count = 0;
  for (const stage of Object.values(stages)) {
    if (stage && (stage.min != null || stage.max != null)) {
      count += 1;
    }
  }
  return count;
}

export function selectBestDurationPerRoute(durationEntries) {
  if (!durationEntries?.length) return [];

  const bySource = new Map();
  for (const entry of durationEntries) {
    if (!bySource.has(entry.source)) {
      bySource.set(entry.source, []);
    }
    bySource.get(entry.source).push(entry);
  }

  const sortedSources = Array.from(bySource.keys()).sort(
    (a, b) => getDurationSourcePriority(a) - getDurationSourcePriority(b),
  );
  const primaryRoutes = (bySource.get(sortedSources[0]) || []).map((entry) => normalizeRoute(entry.route));

  const byRoute = new Map();
  for (const entry of durationEntries) {
    const route = normalizeRoute(entry.route);
    const existing = byRoute.get(route);
    const sourcePriority = getDurationSourcePriority(entry.source);

    if (!existing) {
      byRoute.set(route, entry);
      continue;
    }

    const newCount = countFilledDurationFields(entry.stages);
    const existingCount = countFilledDurationFields(existing.stages);
    if (newCount > existingCount) {
      byRoute.set(route, entry);
    } else if (newCount === existingCount && sourcePriority < getDurationSourcePriority(existing.source)) {
      byRoute.set(route, entry);
    }
  }

  const result = [];
  const added = new Set();

  for (const route of primaryRoutes) {
    if (byRoute.has(route) && !added.has(route)) {
      result.push(byRoute.get(route));
      added.add(route);
    }
  }

  for (const [route, entry] of byRoute) {
    if (!added.has(route)) {
      result.push(entry);
      added.add(route);
    }
  }

  return result;
}

export function transformDuration(parsedDuration) {
  if (!parsedDuration?.length) {
    return { routes: [] };
  }

  const bestEntries = selectBestDurationPerRoute(parsedDuration);
  return {
    routes: bestEntries.map((entry) => ({
      route: normalizeRoute(entry.route),
      stages: transformStages(entry.stages),
    })),
  };
}
