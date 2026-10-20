import { normalizeRouteName } from "../../../lib/article/normalization.mjs";
import type { DosageRoute, PlateauDosing } from "./dosage";
import type { DurationRoute } from "./duration";
import {
  hasDosageContent,
  routeHasDosageContent,
  routeHasDurationContent,
} from "./dosageDurationPresence.ts";

export interface RouteRow<Route> {
  route: Route;
  index: number;
}

export interface DosageDurationRoutePanel<
  Dosage extends Partial<DosageRoute>,
  Duration extends Partial<DurationRoute>,
> {
  key: string;
  dosage?: RouteRow<Dosage>;
  duration?: RouteRow<Duration>;
}

export function projectDosageDurationRoutes<
  Dosage extends Partial<DosageRoute>,
  Duration extends Partial<DurationRoute>,
>(
  dosageRoutes: readonly Dosage[],
  durationRoutes: readonly Duration[],
  plateauDosing: PlateauDosing | null | undefined,
): Array<DosageDurationRoutePanel<Dosage, Duration>> {
  const groups = new Map<
    string,
    { dosage: Array<RouteRow<Dosage>>; duration: Array<RouteRow<Duration>> }
  >();
  const groupFor = (route: Partial<DosageRoute | DurationRoute> | null) => {
    if (!route || typeof route !== "object") return null;
    const key = normalizeRouteName(route.route ?? "");
    if (!key) return null;
    const existing = groups.get(key);
    if (existing) return existing;
    const created = { dosage: [], duration: [] };
    groups.set(key, created);
    return created;
  };
  dosageRoutes.forEach((route, index) => groupFor(route)?.dosage.push({ route, index }));
  durationRoutes.forEach((route, index) => groupFor(route)?.duration.push({ route, index }));

  const rows = Array.from(groups, ([key, group]) => ({
    key,
    group,
    dosage: group.dosage.find((row) => routeHasDosageContent(row.route)),
    duration: group.duration.find((row) => routeHasDurationContent(row.route)),
  }));
  const plateauNeedsHost =
    hasDosageContent({ routes: [], plateau_dosing: plateauDosing }) &&
    !rows.some((row) => row.dosage);
  let shown = rows.filter((row) => row.dosage || row.duration);
  if (shown.length === 0 && plateauNeedsHost) {
    shown = rows.filter((row) => row.group.dosage.length > 0);
  }

  return shown.map((row) => ({
    key: row.key,
    dosage: row.dosage ?? (plateauNeedsHost ? row.group.dosage[0] : undefined),
    duration: row.duration,
  }));
}

export type PlateauTierKey = Exclude<keyof PlateauDosing, "notes">;

const PLATEAU_TIER_KEYS: readonly PlateauTierKey[] = [
  "first_plateau",
  "second_plateau",
  "third_plateau",
  "fourth_plateau",
  "fifth_plateau",
];

export interface ShownPlateauTier {
  key: PlateauTierKey;
  isSigma: boolean;
  hasDoseRange: boolean;
  plateau: NonNullable<PlateauDosing[PlateauTierKey]>;
}

export function shownPlateauTiers(plateauDosing: PlateauDosing): ShownPlateauTier[] {
  return PLATEAU_TIER_KEYS.flatMap((key) => {
    const plateau = plateauDosing[key];
    if (!plateau || typeof plateau !== "object") return [];
    const isSigma = key === "fifth_plateau";
    const hasDoseRange = plateau.min !== null || plateau.max !== null;
    if (!isSigma && !hasDoseRange) return [];
    return [{ key, isSigma, hasDoseRange, plateau }];
  });
}
