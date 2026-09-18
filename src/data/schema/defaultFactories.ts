import type { DosageRoute, DoseRanges, DurationRoute, DurationStages } from "@/schema";
import type { DoseRange, DurationStage } from "./types";

export function createEmptyDoseRange(): DoseRange {
  return { min: null, max: null, unit: "" };
}

export function createEmptyDurationStage(): DurationStage {
  return { min: null, max: null, unit: "" };
}

export function createEmptyDoseRanges(): DoseRanges {
  return {
    threshold: createEmptyDoseRange(),
    light: createEmptyDoseRange(),
    moderate: createEmptyDoseRange(),
    strong: createEmptyDoseRange(),
    heavy: createEmptyDoseRange(),
  };
}

export function createEmptyDurationStages(): DurationStages {
  return {
    onset: createEmptyDurationStage(),
    come_up: createEmptyDurationStage(),
    peak: createEmptyDurationStage(),
    offset: createEmptyDurationStage(),
    after_effects: createEmptyDurationStage(),
    total_duration: createEmptyDurationStage(),
  };
}

export function createEmptyDosageRoute(
  route = "",
  values: Partial<Pick<DosageRoute, "bioavailability" | "bioavailability_notes" | "notes" | "reference_ids">> = {},
): DosageRoute {
  return {
    route,
    bioavailability: values.bioavailability ?? "",
    bioavailability_notes: values.bioavailability_notes ?? "",
    dose_ranges: createEmptyDoseRanges(),
    notes: values.notes ?? "",
    reference_ids: values.reference_ids ?? [],
  };
}

export function createEmptyDurationRoute(
  route = "",
  values: Partial<Pick<DurationRoute, "half_life" | "half_life_notes" | "reference_ids">> = {},
): DurationRoute {
  return {
    route,
    half_life: values.half_life ?? "",
    half_life_notes: values.half_life_notes ?? "",
    stages: createEmptyDurationStages(),
    reference_ids: values.reference_ids ?? [],
  };
}
