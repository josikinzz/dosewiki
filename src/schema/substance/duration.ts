import { z } from "zod";

import { durationStageSchema, referenceIdArraySchema } from "./shared";

export const durationStagesSchema = z.object({
  onset: durationStageSchema,
  come_up: durationStageSchema,
  peak: durationStageSchema,
  offset: durationStageSchema,
  after_effects: durationStageSchema,
  total_duration: durationStageSchema,
});

export const durationRouteSchema = z.object({
  route: z.string(),
  half_life: z.string().default(""),
  half_life_notes: z.string().default(""),
  stages: durationStagesSchema,
  reference_ids: referenceIdArraySchema.optional(),
});

export const durationSchema = z.object({
  routes: z.array(durationRouteSchema),
});

export type DurationStages = z.infer<typeof durationStagesSchema>;
export type DurationRoute = z.infer<typeof durationRouteSchema>;
