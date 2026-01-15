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

// Changelog entry for tracking article changes
const changelogEntry = v.object({
  entryId: v.string(),        // unique ID for the entry (matches existing "id" field pattern)
  createdAt: v.string(),      // ISO timestamp
  message: v.string(),        // commit/save message
  markdown: v.string(),       // unified diff text
  submittedBy: v.union(v.string(), v.null()),
  articles: v.array(v.object({
    id: v.number(),
    title: v.string(),
    slug: v.string(),
  })),
});

// Article source files - stores scraped content per substance
const articleSource = v.object({
  slug: v.string(),           // e.g., "ketamine"
  substanceName: v.string(),  // e.g., "Ketamine"
  sources: v.array(v.object({
    id: v.string(),           // e.g., "psychonautwiki"
    fileName: v.string(),
    displayName: v.string(),
    size: v.number(),
    tokens: v.number(),
  })),
  contents: v.any(),          // Record<sourceId, content string>
});

// Prompts - both main generator prompt and section prompts
const prompt = v.object({
  key: v.string(),            // "generator" or "section_harm_potential", etc.
  content: v.string(),        // Markdown content
  updatedAt: v.string(),      // ISO timestamp
  updatedBy: v.optional(v.string()),
});

// Quote documents - extracted quotes per substance per section
const quote = v.object({
  slug: v.string(),           // Substance slug
  section: v.string(),        // "harm_potential", "pharmacology", "history_culture"
  content: v.string(),        // Full markdown content
  updatedAt: v.string(),
  updatedBy: v.optional(v.string()),
});

export default defineSchema({
  // Main articles table - each document is a complete SubstanceArticle
  articles: defineTable(substanceArticle)
    .index("by_title", ["title"])
    .index("by_article_id", ["id"]),

  // Changelog table - tracks all article changes
  changelog: defineTable(changelogEntry)
    .index("by_entry_id", ["entryId"])
    .index("by_created_at", ["createdAt"]),

  // Article source files - scraped content per substance (read-only after migration)
  articleSources: defineTable(articleSource)
    .index("by_slug", ["slug"]),

  // Prompts - editable system and section prompts
  prompts: defineTable(prompt)
    .index("by_key", ["key"]),

  // Quote documents - extracted quotes per substance per section
  quotes: defineTable(quote)
    .index("by_slug_section", ["slug", "section"])
    .index("by_section", ["section"]),
});
