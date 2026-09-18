import { z } from "zod";

import { countryLegalitySchema } from "./shared";

/** A US state legality entry, with optional city-level divergences. */
export const usStateLegalitySchema = countryLegalitySchema.extend({
  cities: z.record(z.string(), countryLegalitySchema).optional(),
});

/** Legality section */
export const legalitySchema = z.object({
  international: z.array(z.string()),
  countries: z.record(z.string(), countryLegalitySchema),
  usStates: z.record(z.string(), usStateLegalitySchema).optional(),
  usStatesNote: z.string().optional(),
});

export type Legality = z.infer<typeof legalitySchema>;
export type USStateLegality = z.infer<typeof usStateLegalitySchema>;
