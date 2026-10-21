import type { DosageRoute, DoseRanges, PlateauDosing } from "./dosage";
import type { DurationRoute, DurationStages } from "./duration";
import type { DoseRange, DurationStage } from "./shared";

type MaybeBounded = Partial<Pick<DoseRange | DurationStage, "min" | "max">> | null | undefined;

function hasNumericBound(value: MaybeBounded): boolean {
  if (!value) return false;
  return (
    (value.min !== null && value.min !== undefined) ||
    (value.max !== null && value.max !== undefined)
  );
}

function hasProse(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function someBounded(group: Partial<DoseRanges | DurationStages> | null | undefined): boolean {
  if (!group || typeof group !== "object") return false;
  return Object.values(group).some((entry) => hasNumericBound(entry as MaybeBounded));
}

function routeHasDoseValues(route: Partial<DosageRoute> | null | undefined): boolean {
  return someBounded(route?.dose_ranges);
}

function routeHasDurationValues(route: Partial<DurationRoute> | null | undefined): boolean {
  return someBounded(route?.stages);
}

export function routeHasBioavailability(route: Partial<DosageRoute>): boolean {
  return hasProse(route.bioavailability);
}

export function routeHasHalfLife(route: Partial<DurationRoute>): boolean {
  return hasProse(route.half_life);
}

export function routeHasDosageContent(route: Partial<DosageRoute> | null | undefined): boolean {
  if (!route) return false;
  return (
    routeHasDoseValues(route) ||
    hasProse(route.bioavailability) ||
    hasProse(route.bioavailability_notes) ||
    hasProse(route.notes)
  );
}

export function routeHasDurationContent(route: Partial<DurationRoute> | null | undefined): boolean {
  if (!route) return false;
  return (
    routeHasDurationValues(route) ||
    hasProse(route.half_life) ||
    hasProse(route.half_life_notes)
  );
}

export function routeIsBlank(
  route: Partial<DosageRoute & DurationRoute> | null | undefined,
): boolean {
  return !routeHasDosageContent(route) && !routeHasDurationContent(route);
}

function hasPlateauContent(plateau: PlateauDosing | null | undefined): boolean {
  if (!plateau || typeof plateau !== "object") return false;
  if (hasProse(plateau.notes)) return true;
  return Object.values(plateau).some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const dose = entry as { min?: number | null; max?: number | null; effects?: string | null };
    return hasNumericBound(dose) || hasProse(dose.effects);
  });
}

type DosageLike = { routes?: Array<Partial<DosageRoute>> | null; plateau_dosing?: PlateauDosing | null } | null | undefined;
type DurationLike = { routes?: Array<Partial<DurationRoute>> | null } | null | undefined;

export function hasDosageContent(dosage: DosageLike): boolean {
  if (!dosage) return false;
  if (hasPlateauContent(dosage.plateau_dosing)) return true;
  const routes = dosage.routes;
  if (!Array.isArray(routes)) return false;
  return routes.some(routeHasDosageContent);
}

export function hasDurationContent(duration: DurationLike): boolean {
  if (!duration) return false;
  const routes = duration.routes;
  if (!Array.isArray(routes)) return false;
  return routes.some(routeHasDurationContent);
}

export function hasDosageDurationContent(
  article: { dosage?: DosageLike; duration?: DurationLike } | null | undefined,
): boolean {
  if (!article) return false;
  return hasDosageContent(article.dosage) || hasDurationContent(article.duration);
}
