import { z } from "zod";

import { countryLegalitySchema } from "./shared";

/** Legality section */
export const legalitySchema = z.object({
  international: z.array(z.string()),
  countries: z.record(z.string(), countryLegalitySchema),
});

export type Legality = z.infer<typeof legalitySchema>;
