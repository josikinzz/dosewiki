import type {
  DoseRange,
  DoseRanges,
  DosageRoute,
  DurationRoute,
  DurationStage,
  DurationStages,
} from "../../schema";
import type { RouteInfo, RouteKey } from "../../types/content";
import { cleanString, slugifyDrugName, titleize } from "./contentBuilderShared";
import { canonicalizeRouteLabel } from "./taxonomy";

type DosageRouteInput = Pick<
  DosageRoute,
  "route" | "dose_ranges" | "bioavailability" | "notes"
>;
type DurationRouteInput = Pick<DurationRoute, "route" | "stages">;

function formatDoseRange(range: DoseRange | null | undefined): string | undefined {
  if (!range) {
    return undefined;
  }

  const { max, min, unit } = range;
  if (min == null && max == null) {
    return undefined;
  }

  const unitLabel = cleanString(unit) || "";
  if (min != null && max != null) {
    if (min === max) {
      return `${min} ${unitLabel}`.trim();
    }
    return `${min}-${max} ${unitLabel}`.trim();
  }
  if (min != null) {
    return `${min}+ ${unitLabel}`.trim();
  }
  if (max != null) {
    return `<${max} ${unitLabel}`.trim();
  }

  return undefined;
}

function formatDurationStage(stage: DurationStage | null | undefined): string | undefined {
  if (!stage) {
    return undefined;
  }

  const { max, min, unit } = stage;
  if (min == null && max == null) {
    return undefined;
  }

  const unitLabel = cleanString(unit) || "";
  if (min != null && max != null) {
    if (min === max) {
      return `${min} ${unitLabel}`.trim();
    }
    return `${min}-${max} ${unitLabel}`.trim();
  }
  if (min != null) {
    return `${min}+ ${unitLabel}`.trim();
  }
  if (max != null) {
    return `<${max} ${unitLabel}`.trim();
  }

  return undefined;
}

function formatThresholdRange(range: DoseRange | null | undefined): string | undefined {
  if (!range) {
    return undefined;
  }

  const { max, min, unit } = range;
  if (min == null && max == null) {
    return undefined;
  }

  const unitLabel = cleanString(unit) || "";
  if (min != null && max != null) {
    if (min === max) {
      return `${min} ${unitLabel}`.trim();
    }
    return `${min}-${max} ${unitLabel}`.trim();
  }
  if (min != null) {
    return `~${min} ${unitLabel}`.trim();
  }
  if (max != null) {
    return `<${max} ${unitLabel}`.trim();
  }

  return undefined;
}

function buildDoseEntries(ranges: DoseRanges | null | undefined): RouteInfo["dosage"] {
  if (!ranges) {
    return [];
  }

  const doseKeys: Array<keyof DoseRanges> = ["threshold", "light", "moderate", "strong", "heavy"];

  return doseKeys
    .map((key) => {
      const range = ranges[key];
      const value = key === "threshold" ? formatThresholdRange(range) : formatDoseRange(range);

      if (!value) {
        return null;
      }

      return {
        label: titleize(key),
        value,
      };
    })
    .filter((entry): entry is { label: string; value: string } => entry !== null);
}

function buildDurationEntries(stages: DurationStages | null | undefined): RouteInfo["duration"] {
  if (!stages) {
    return [];
  }

  const stageKeys: Array<[keyof DurationStages, string]> = [
    ["onset", "Onset"],
    ["come_up", "Come-up"],
    ["peak", "Peak"],
    ["offset", "Offset"],
    ["after_effects", "After effects"],
    ["total_duration", "Total"],
  ];

  return stageKeys
    .map(([key, label]) => {
      const value = formatDurationStage(stages[key]);
      return value ? { label, value } : null;
    })
    .filter((entry): entry is { label: string; value: string } => entry !== null);
}

function findDurationRoute(
  durationRoutes: DurationRouteInput[] | undefined,
  routeLabel: string,
): DurationRouteInput | undefined {
  if (!durationRoutes || durationRoutes.length === 0) {
    return undefined;
  }

  const normalizedLabel = routeLabel.trim().toLowerCase();
  const directMatch = durationRoutes.find((entry) => {
    const entryRoute = cleanString(entry.route);
    return entryRoute && entryRoute.toLowerCase() === normalizedLabel;
  });

  if (directMatch) {
    return directMatch;
  }

  const canonical = canonicalizeRouteLabel(routeLabel);
  for (const canonicalRoute of canonical.canonicalRoutes) {
    const match = durationRoutes.find((entry) => {
      const entryRoute = cleanString(entry.route);
      return entryRoute && entryRoute.toLowerCase() === canonicalRoute.toLowerCase();
    });

    if (match) {
      return match;
    }
  }

  return durationRoutes[0];
}

export function buildRoutes(
  dosageRoutes: DosageRouteInput[] | undefined,
  durationRoutes: DurationRouteInput[] | undefined,
) {
  const routes: Record<RouteKey, RouteInfo> = {};
  const routeOrder: RouteKey[] = [];
  const units = new Set<string>();

  if (dosageRoutes && dosageRoutes.length > 0) {
    dosageRoutes.forEach((dosageRoute, index) => {
      const routeLabel = cleanString(dosageRoute.route);
      if (!routeLabel) {
        return;
      }

      const key = slugifyDrugName(routeLabel, `route-${index}`);
      const dosageEntries = buildDoseEntries(dosageRoute.dose_ranges);
      const matchingDuration = findDurationRoute(durationRoutes, routeLabel);
      const durationEntries = buildDurationEntries(matchingDuration?.stages);

      const firstRange = dosageRoute.dose_ranges?.threshold
        || dosageRoute.dose_ranges?.light
        || dosageRoute.dose_ranges?.moderate;
      const unit = cleanString(firstRange?.unit);
      if (unit) {
        units.add(unit);
      }

      routes[key] = {
        label: routeLabel,
        units: unit,
        dosage: dosageEntries,
        duration: durationEntries,
        bioavailability: cleanString(dosageRoute.bioavailability),
        notes: cleanString(dosageRoute.notes),
      };

      if (!routeOrder.includes(key)) {
        routeOrder.push(key);
      }
    });
  }

  if (routeOrder.length === 0 && durationRoutes && durationRoutes.length > 0) {
    durationRoutes.forEach((durationRoute, index) => {
      const routeLabel = cleanString(durationRoute.route) || "General";
      const key = slugifyDrugName(routeLabel, `route-${index}`);
      const durationEntries = buildDurationEntries(durationRoute.stages);

      if (durationEntries.length > 0) {
        routes[key] = {
          label: routeLabel,
          dosage: [],
          duration: durationEntries,
        };
        routeOrder.push(key);
      }
    });
  }

  const unitsNote = units.size > 0 ? `Units: ${Array.from(units).join(", ")}` : "";

  return {
    note: unitsNote,
    routeOrder,
    routes,
    unitsNote,
  };
}
