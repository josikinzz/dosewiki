import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex schema for DoseWiki.
 * 
 * Articles are stored as complete documents with the full SubstanceArticle structure.
 * 
 * We use a permissive schema here because:
 * 1. The actual data has many optional fields and variations
 * 2. Zod validation happens on the frontend before display
 * 3. This avoids constant schema updates as data evolves
 * 
 * The frontend's Zod schema (src/schema/substance.schema.ts) is the source of truth
 * for type validation.
 */

// Only validate the essential top-level fields for indexing
// All nested content uses v.any() for flexibility
const substanceArticle = v.object({
  // Core fields needed for indexing and identification
  id: v.union(v.number(), v.null()),
  title: v.string(),
  priority: v.optional(v.union(v.literal("high"), v.literal("normal"), v.literal("low"), v.null())),
  index_categories: v.array(v.string()),

  // All other content - validated by Zod on frontend
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
  source_citations: v.optional(v.any()),
  citations: v.any(),
});

export default defineSchema({
  // Main articles table - each document is a complete SubstanceArticle
  articles: defineTable(substanceArticle)
    .index("by_title", ["title"])
    .index("by_article_id", ["id"]),
});
