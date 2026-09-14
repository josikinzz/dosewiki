import { z } from "zod";

/** Drug comparison entry */
export const drugComparisonSchema = z.object({
  drug: z.string(),
  comparison: z.string(),
});

/** Single pharmacological target or binding-site interaction entry. */
const bindingSiteEntrySchema = z.object({
  target: z.string(),
  tag: z.string().optional(),
  affinity: z.string().optional(),
  efficacy: z.string().optional(),
});

/** Pharmacology section */
export const pharmacologySchema = z.object({
  pharmacodynamics: z.string().optional().default(""),
  summary: z.string().optional(),
  binding_sites: z.array(bindingSiteEntrySchema),
  pharmacokinetics: z.string(),
  metabolites: z.array(z.string()),
  protein_binding: z.string().nullable().optional(),
  volume_of_distribution: z.string().nullable().optional(),
  route_bioavailability: z.record(z.string(), z.string()).optional(),
  route_half_life: z.record(z.string(), z.string()).optional(),
  route_half_life_notes: z.record(z.string(), z.string()).optional(),
  route_bioavailability_notes: z.record(z.string(), z.string()).optional(),
  bioavailability_notes: z.string().optional(),
  half_life: z.string().optional(),
});

export type Pharmacology = z.infer<typeof pharmacologySchema>;
