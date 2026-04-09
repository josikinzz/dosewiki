/**
 * Convex validators for article data.
 *
 * SECURITY: This implements VULN-03 remediation from the security audit.
 * These validators provide stronger type checking than v.any() while
 * maintaining flexibility for nested content that varies by substance.
 *
 * The Zod schema in src/schema/substance.schema.ts remains the source of
 * truth for frontend validation. These Convex validators provide a
 * complementary layer of defense at the database level.
 */

import { v } from "convex/values";

/**
 * Validator for the core article fields that must always be present.
 * Nested content uses v.any() for flexibility but top-level structure is validated.
 */
export const substanceArticleValidator = v.object({
  // Core identification - required for all articles
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

  // Identification - required structure with string fields
  identification: v.object({
    common_name: v.string(),
    substitutive_name: v.string(),
    iupac_name: v.string(),
    alternative_names: v.array(v.string()),
    smiles: v.string(),
    inchi_key: v.string(),
    cas_number: v.string(),
    molecular_formula: v.string(),
    molecular_weight: v.string(),
    skeletal_structure_image: v.string(),
    botanical_name: v.optional(v.union(v.string(), v.null())),
  }),

  // Classification - required arrays
  classification: v.object({
    psychoactive_class: v.array(v.string()),
    chemical_class: v.array(v.string()),
  }),

  // Content sections - use v.any() for flexibility in nested structure
  // These are validated by Zod on the frontend before display
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
  source_citations: v.optional(v.any()),
  citations: v.any(),
});

/**
 * Lighter validator for bulk import operations.
 * Only validates the absolute essentials to prevent obviously malformed data.
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
  source_citations: v.optional(v.any()),
  citations: v.any(),
});

/**
 * Validate that an article has the minimum required fields.
 * Returns true if valid, false otherwise.
 */
export function isValidArticle(article: unknown): boolean {
  if (typeof article !== "object" || article === null) {
    return false;
  }

  const a = article as Record<string, unknown>;

  // Check required fields
  if (typeof a.title !== "string" || a.title.length === 0) {
    return false;
  }

  if (a.id !== null && typeof a.id !== "number") {
    return false;
  }

  if (!Array.isArray(a.index_categories)) {
    return false;
  }

  // Check identification object
  if (typeof a.identification !== "object" || a.identification === null) {
    return false;
  }

  // Check classification object
  if (typeof a.classification !== "object" || a.classification === null) {
    return false;
  }

  const classification = a.classification as Record<string, unknown>;
  if (!Array.isArray(classification.psychoactive_class)) {
    return false;
  }
  if (!Array.isArray(classification.chemical_class)) {
    return false;
  }

  return true;
}

/**
 * Severity level validator for harm potential ratings.
 */
export const severityLevelValidator = v.union(
  v.literal("extremely_low"),
  v.literal("low"),
  v.literal("moderate"),
  v.literal("high"),
  v.literal("extremely_high"),
  v.null()
);

/**
 * Carcinogenicity level validator.
 */
export const carcinogenicityLevelValidator = v.union(
  v.literal("confirmed"),
  v.literal("probable"),
  v.literal("possible"),
  v.literal("no_evidence"),
  v.literal("unknown"),
  v.null()
);
