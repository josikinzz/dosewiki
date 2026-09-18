/**
 * Native validators for substance article data.
 *
 * Validation layers for substance writes (see src/schema/substance/contract.ts
 * for the full tier overview):
 *
 * 1. `substanceArticleLightValidator` (this file) — the handler *arg* layer.
 *    It only pins the identity fields (id/title/slug/priority/index_categories)
 *    so malformed payloads fail fast at the function boundary while staying
 *    permissive about nested section content.
 * 2. `validateArticleForIngestion` (this file) — the *contract* layer. Every
 *    substance-writing mutation handler runs the shared Zod contract
 *    (`validateSubstanceArticleContract`) before any insert/patch.
 *
 * The Zod schema in src/schema/substance/ is the single source of truth; the
 * old hand-written strict v.object validator that shadowed it has been retired.
 */

import { v } from "../../lib/postgres/runtime/values"
import {
  formatSubstanceArticleContractIssues,
  validateSubstanceArticleContract,
  type SubstanceArticleStorage,
} from "../../src/schema/substance/contract";

/**
 * Light arg validator for substance write mutations.
 * Only validates the identity essentials at the native function boundary;
 * full structural validation happens via `validateArticleForIngestion`.
 */
export const substanceArticleLightValidator = v.object({
  id: v.union(v.number(), v.null()),
  title: v.string(),
  slug: v.optional(v.string()),
  priority: v.optional(
    v.union(
      v.literal("high"),
      v.literal("normal"),
      v.literal("low"),
      v.literal("hide_for_now"),
      v.null(),
    )
  ),
  index_categories: v.array(v.string()),
  // Allow any additional fields
  identification: v.any(),
  classification: v.any(),
  summary: v.any(),
  dosage: v.any(),
  duration: v.any(),
  subjective_effects: v.any(),
  comparisons: v.any(),
  pharmacology: v.any(),
  interactions: v.any(),
  reagent_testing: v.any(),
  tolerance: v.any(),
  harm_potential: v.any(),
  history_culture: v.optional(v.any()),
  legality: v.any(),
  editorial_review: v.optional(v.any()),
  references: v.optional(v.any()),
  source_citations: v.optional(v.any()),
  citations: v.any(),
});

/**
 * Index layout arg validator, shared by `indexLayouts.save` and the change
 * proposal submit path so a proposed layout is checked exactly like a saved one.
 */
export const indexLayoutValidator = v.object({
  type: v.union(v.literal("psychoactive"), v.literal("chemical"), v.literal("mechanism")),
  version: v.number(),
  categories: v.array(
    v.object({
      key: v.string(),
      label: v.string(),
      iconKey: v.string(),
      notes: v.optional(v.string()),
      columns: v.optional(v.any()),
      drugs: v.array(v.string()),
      sections: v.array(
        v.object({
          key: v.string(),
          label: v.string(),
          notes: v.optional(v.string()),
          link: v.optional(
            v.object({
              type: v.union(
                v.literal("chemicalClass"),
                v.literal("psychoactiveClass"),
                v.literal("mechanism"),
              ),
              value: v.string(),
            }),
          ),
          drugs: v.array(v.string()),
        }),
      ),
    }),
  ),
});

/**
 * Validate the complete article contract before writing to Postgres.
 * The storage schema remains permissive for rollout/migrations, but
 * ingestion uses the same Zod contract as frontend article rendering.
 */
export function validateArticleForIngestion(article: unknown):
  | { ok: true; article: SubstanceArticleStorage }
  | { ok: false; message: string; issues: string[] } {
  const result = validateSubstanceArticleContract(article);

  if (result.ok) {
    return { ok: true, article: result.article };
  }

  return {
    ok: false,
    message: formatSubstanceArticleContractIssues(result.issues),
    issues: result.issues.map((issue) => `${issue.path}: ${issue.message}`),
  };
}
