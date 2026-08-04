/**
 * Convex validators for substance article data.
 *
 * Validation layers for substance writes (see src/schema/substance/contract.ts
 * for the full tier overview):
 *
 * 1. `substanceArticleLightValidator` (this file) — the Convex *arg* layer.
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

import { v } from "convex/values";
import {
  formatSubstanceArticleContractIssues,
  validateSubstanceArticleContract,
  type SubstanceArticleStorage,
} from "../../src/schema/substance/contract";

/**
 * Light arg validator for substance write mutations.
 * Only validates the identity essentials at the Convex function boundary;
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
      v.null()
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
 * Validate the complete article contract before writing to Convex.
 * The Convex storage schema remains permissive for rollout/migrations, but
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
