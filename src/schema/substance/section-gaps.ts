import { z } from "zod";

const sectionGapNeighbourSchema = z.object({
  slug: z.string(),
  name: z.string(),
  note: z.string().optional(),
})

const sectionGapReasonSchema = z.enum([
  "sources-silent",
  "not-written",
])

const sectionGapOverrideSchema = z.object({
  reason: sectionGapReasonSchema.optional(),
  neighbours: z.array(sectionGapNeighbourSchema).optional(),
})

export const sectionGapsSchema = z.object({
  family: z.string().optional(),
  neighbours: z.array(sectionGapNeighbourSchema).default([]),
  reason: sectionGapReasonSchema.optional(),
  sections: z.record(z.string(), sectionGapOverrideSchema).optional(),
});

export type SectionGapNeighbour = z.infer<typeof sectionGapNeighbourSchema>;
export type SectionGapReason = z.infer<typeof sectionGapReasonSchema>;
