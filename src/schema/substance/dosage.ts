import { z } from "zod";

import { doseRangeSchema, referenceIdArraySchema } from "./shared";

export const doseRangesSchema = z.object({
  threshold: doseRangeSchema,
  light: doseRangeSchema,
  moderate: doseRangeSchema,
  strong: doseRangeSchema,
  heavy: doseRangeSchema,
});

export const dosageRouteSchema = z.object({
  route: z.string(),
  bioavailability: z.string(),
  bioavailability_notes: z.string().default(""),
  dose_ranges: doseRangesSchema,
  notes: z.string(),
  reference_ids: referenceIdArraySchema.optional(),
});

const plateauDoseSchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
  unit: z.string(),
  effects: z.string(),
})

const plateauDosingSchema = z.object({
  first_plateau: plateauDoseSchema,
  second_plateau: plateauDoseSchema,
  third_plateau: plateauDoseSchema,
  fourth_plateau: plateauDoseSchema,
  fifth_plateau: plateauDoseSchema.nullable(),
  notes: z.string().nullable(),
})

export const dosageSchema = z.object({
  routes: z.array(dosageRouteSchema),
  plateau_dosing: plateauDosingSchema.nullable(),
});

export type DoseRanges = z.infer<typeof doseRangesSchema>;
export type DosageRoute = z.infer<typeof dosageRouteSchema>;
export type PlateauDosing = z.infer<typeof plateauDosingSchema>;
