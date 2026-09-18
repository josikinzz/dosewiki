import { z } from "zod";

import { doseRangeSchema, referenceIdArraySchema } from "./shared";

/** All dose tiers for a route */
export const doseRangesSchema = z.object({
  threshold: doseRangeSchema,
  light: doseRangeSchema,
  moderate: doseRangeSchema,
  strong: doseRangeSchema,
  heavy: doseRangeSchema,
});

/** Single dosage route */
export const dosageRouteSchema = z.object({
  route: z.string(),
  bioavailability: z.string(),
  bioavailability_notes: z.string().default(""),
  dose_ranges: doseRangesSchema,
  notes: z.string(),
  reference_ids: referenceIdArraySchema.optional(),
});

/** DXM-specific plateau dose */
const plateauDoseSchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
  unit: z.string(),
  effects: z.string(),
})

/** DXM-specific plateau dosing */
const plateauDosingSchema = z.object({
  first_plateau: plateauDoseSchema,
  second_plateau: plateauDoseSchema,
  third_plateau: plateauDoseSchema,
  fourth_plateau: plateauDoseSchema,
  fifth_plateau: plateauDoseSchema.nullable(),
  notes: z.string().nullable(),
})

/** Dosage section */
export const dosageSchema = z.object({
  routes: z.array(dosageRouteSchema),
  plateau_dosing: plateauDosingSchema.nullable(),
});

export type DoseRanges = z.infer<typeof doseRangesSchema>;
export type DosageRoute = z.infer<typeof dosageRouteSchema>;
export type PlateauDosing = z.infer<typeof plateauDosingSchema>;
