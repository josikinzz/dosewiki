import type { DosageRoute, DoseRanges, PlateauDosing } from "./dosage";
import type { DurationRoute, DurationStages } from "./duration";
import type { DoseRange, DurationStage } from "./shared";

/**
 * Presence predicates for dosage and duration.
 *
 * A route object is not evidence of a route's data. Generators scaffold a full
 * route skeleton — every tier and stage present but null — whenever a source
 * merely mentions an ROA, so `routes.length > 0` reports content that renders as
 * an empty table. These predicates descend into the values instead, and are the
 * single source of truth shared by the article renderer, the section manifest,
 * the coverage audit, and the cleanup tooling.
 *
 * Numbers are not the only content: `bioavailability`, `half_life`, and `notes`
 * render independently of the tier rows, and some routes legitimately carry
 * prose explaining why no dose ladder exists (salvia's unstandardized extracts,
 * for instance). A route counts as present when it has anything a reader sees.
 */

type MaybeBounded = Pick<DoseRange | DurationStage, "min" | "max"> | null | undefined;

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

/** True when any dose tier on this route carries a number. */
function routeHasDoseValues(route: Partial<DosageRoute> | null | undefined): boolean {
  return someBounded(route?.dose_ranges);
}

/** True when any duration stage on this route carries a number. */
function routeHasDurationValues(route: Partial<DurationRoute> | null | undefined): boolean {
  return someBounded(route?.stages);
}

/**
 * True when this dosage route renders anything at all — dose numbers,
 * bioavailability, or notes.
 */
export function routeHasDosageContent(route: Partial<DosageRoute> | null | undefined): boolean {
  if (!route) return false;
  return (
    routeHasDoseValues(route) ||
    hasProse(route.bioavailability) ||
    hasProse(route.bioavailability_notes) ||
    hasProse(route.notes)
  );
}

/**
 * True when this duration route renders anything at all — stage numbers or
 * half-life prose.
 */
export function routeHasDurationContent(route: Partial<DurationRoute> | null | undefined): boolean {
  if (!route) return false;
  return (
    routeHasDurationValues(route) ||
    hasProse(route.half_life) ||
    hasProse(route.half_life_notes)
  );
}

/**
 * True when a route is safe to delete: it renders nothing on either side.
 * Used by cleanup tooling, which must preserve prose-only routes.
 */
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

/** True when the article has at least one dosage route that renders content. */
export function hasDosageContent(dosage: DosageLike): boolean {
  if (!dosage) return false;
  if (hasPlateauContent(dosage.plateau_dosing)) return true;
  const routes = dosage.routes;
  if (!Array.isArray(routes)) return false;
  return routes.some(routeHasDosageContent);
}

/** True when the article has at least one duration route that renders content. */
export function hasDurationContent(duration: DurationLike): boolean {
  if (!duration) return false;
  const routes = duration.routes;
  if (!Array.isArray(routes)) return false;
  return routes.some(routeHasDurationContent);
}

/**
 * Section-level presence for Dosage & Duration. Replaces the route-count check
 * that reported hollow scaffolding as published data.
 */
export function hasDosageDurationContent(
  article: { dosage?: DosageLike; duration?: DurationLike } | null | undefined,
): boolean {
  if (!article) return false;
  return hasDosageContent(article.dosage) || hasDurationContent(article.duration);
}
