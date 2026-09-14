import { z } from "zod";

/**
 * Editorial metadata for sections that have no content.
 *
 * A section with no data still renders — as a notice stating the absence, with
 * an optional list of better-documented neighbours to read instead. This holds
 * the per-article part of that notice; the wording and the per-section policy
 * that decides whether the neighbours may be phrased as an inference live in
 * `src/features/article/components/sections/articleGapCopy.ts`.
 */

/** One neighbour to point a reader at. `slug` must resolve to a dose.wiki article. */
const sectionGapNeighbourSchema = z.object({
  slug: z.string(),
  name: z.string(),
  /** One short clause on why this one, e.g. "closest documented analogue". */
  note: z.string().optional(),
})

const sectionGapReasonSchema = z.enum([
  /** Extraction ran and every indexed source returned nothing. An evidenced absence. */
  "sources-silent",
  /** Sources exist and have not been worked yet. */
  "not-written",
])

const sectionGapOverrideSchema = z.object({
  reason: sectionGapReasonSchema.optional(),
  /** Replaces the article-level list for this section only. */
  neighbours: z.array(sectionGapNeighbourSchema).optional(),
})

export const sectionGapsSchema = z.object({
  /** Reads mid-sentence: "likely somewhat similar to other <family>". */
  family: z.string().optional(),
  /** Default neighbour list, used by every empty section without an override. */
  neighbours: z.array(sectionGapNeighbourSchema).default([]),
  /** Default reason, used by every empty section without an override. */
  reason: sectionGapReasonSchema.optional(),
  /** Per-section overrides, keyed by quote-section id (`tolerance`, `harm_potential`, …). */
  sections: z.record(z.string(), sectionGapOverrideSchema).optional(),
});

export type SectionGapNeighbour = z.infer<typeof sectionGapNeighbourSchema>;
export type SectionGapReason = z.infer<typeof sectionGapReasonSchema>;
