import { v } from "../../lib/postgres/runtime/values"
import {
  formatSubstanceArticleContractIssues,
  validateSubstanceArticleContract,
  type SubstanceArticleStorage,
} from "../../src/schema/substance/contract";

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
