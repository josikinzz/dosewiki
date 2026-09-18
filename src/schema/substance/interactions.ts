import { z } from "zod";

/** Interactions section */
export const interactionsSchema = z.object({
  dangerous: z.array(z.string()),
  unsafe: z.array(z.string()),
  caution: z.array(z.string()),
});

export type Interactions = z.infer<typeof interactionsSchema>;
