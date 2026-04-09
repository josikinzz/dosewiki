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
  slug: v.optional(v.string()),  // URL-friendly identifier, computed from title
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
  editorial_review: v.optional(v.any()),
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

// Trip report timeline entry (onset, peak, offset)
const timelineEntry = v.object({
  time: v.optional(v.string()),
  description: v.string(),
});

// Trip report - imported from EffectIndex
const tripReport = v.object({
  slug: v.string(),
  title: v.string(),
  featured: v.optional(v.boolean()),
  subject: v.object({
    name: v.string(),
    avatar_url: v.optional(v.string()),
    trip_date: v.optional(v.string()),
    age: v.optional(v.string()),
    gender: v.optional(v.string()),
    height: v.optional(v.string()),
    weight: v.optional(v.string()),
    medications: v.optional(v.string()),
    setting: v.optional(v.string()),
    pdf_url: v.optional(v.string()),
  }),
  substances: v.array(v.object({
    name: v.string(),
    dose: v.optional(v.string()),
    roa: v.optional(v.string()),
  })),
  introduction: v.optional(v.string()),
  onset: v.array(timelineEntry),
  peak: v.array(timelineEntry),
  offset: v.array(timelineEntry),
  conclusion: v.optional(v.string()),
  tags: v.array(v.string()),
});

// EffectIndex articles - intensity scales, substance analyses, methodology docs
const effectIndexArticle = v.object({
  slug: v.string(),           // URL-safe identifier (e.g., "dissociative-intensity-scale")
  title: v.string(),          // Display title
  tags: v.array(v.string()),  // Categorization (e.g., ["intensity scale", "dissociative"])
  featured: v.optional(v.boolean()),
  shortDescription: v.optional(v.string()),  // Brief summary
  publicationDate: v.optional(v.string()),   // ISO date
  
  // Content (raw VCode markup + parsed AST)
  body_raw: v.string(),
  body_ast: v.optional(v.any()),
  
  // Authors
  authors: v.optional(v.array(v.string())),
  
  // Citations
  citations: v.optional(v.array(v.object({
    url: v.string(),
    text: v.string(),
  }))),
});

// Subjective effect article - imported from EffectIndex
const subjectiveEffect = v.object({
  slug: v.string(),           // URL-safe identifier (e.g., "geometry")
  name: v.string(),           // Display name (e.g., "Geometry")
  tags: v.array(v.string()),  // Categorization tags (e.g., ["visual", "geometric"])
  featured: v.optional(v.boolean()),

  // Content sections (raw + parsed VCode AST)
  summary: v.string(),        // Plain text summary for SEO/cards
  description_raw: v.string(),
  description_ast: v.optional(v.any()), // Parsed VCode AST (array of nodes)
  long_summary_raw: v.optional(v.string()),   // Extended summary (VCode markup)
  long_summary_ast: v.optional(v.any()),      // Extended summary parsed AST
  analysis_raw: v.optional(v.string()),
  analysis_ast: v.optional(v.any()),
  style_variations_raw: v.optional(v.string()),
  style_variations_ast: v.optional(v.any()),
  personal_commentary_raw: v.optional(v.string()),
  personal_commentary_ast: v.optional(v.any()),

  // Media
  social_media_image: v.optional(v.string()),
  gallery_order: v.optional(v.array(v.string())),  // Replication slugs
  audio_replications: v.optional(v.array(v.object({
    title: v.string(),
    artist: v.string(),
    resource: v.string(),
  }))),

  // Links & References
  see_also: v.optional(v.array(v.object({
    location: v.string(),
    title: v.string(),
  }))),
  external_links: v.optional(v.array(v.object({
    url: v.string(),
    title: v.string(),
  }))),
  citations: v.optional(v.array(v.object({
    url: v.string(),
    text: v.string(),
    from: v.optional(v.string()),
  }))),

  // Subarticles for ToC anchors
  subarticles: v.optional(v.array(v.object({
    id: v.string(),
    title: v.string(),
  }))),

  // Contributors
  contributors: v.optional(v.array(v.string())),
});

// Replication - video or image representation of an effect
const replication = v.object({
  slug: v.string(),                    // URL-friendly identifier (e.g., "breathing-by-artist-name")
  title: v.string(),                   // Display title
  artist: v.string(),                  // Artist/creator name
  artist_url: v.optional(v.string()),  // Artist portfolio/social link
  type: v.union(v.literal("video"), v.literal("image")),  // "video" or "image"
  storage_id: v.string(),              // Convex file storage ID (or placeholder for external URLs)
  effect_slug: v.string(),             // Parent effect (normalized folder name)
  thumbnail_storage_id: v.optional(v.string()), // Video thumbnail storage ID
  url: v.optional(v.string()),         // Direct URL (external Convex storage or CDN)
  thumbnail_url: v.optional(v.string()), // Direct thumbnail URL (for videos)
  width: v.optional(v.number()),       // For responsive display
  height: v.optional(v.number()),
  format: v.string(),                  // File extension (mp4, jpg, etc.)
  file_size: v.optional(v.number()),   // In bytes
  duration: v.optional(v.number()),    // Video duration in seconds
  created_at: v.string(),              // ISO timestamp
});

const membership = v.object({
  email: v.string(),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  role: v.union(v.literal("admin"), v.literal("editor"), v.literal("viewer")),
  provider: v.optional(v.string()),
  providerAccountId: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
  lastSeenAt: v.optional(v.string()),
});

export default defineSchema({
  // Main substance index table - each document is a complete SubstanceArticle
  substanceIndex: defineTable(substanceArticle)
    .index("by_title", ["title"])
    .index("by_article_id", ["id"])
    .index("by_slug", ["slug"])
    .index("by_priority", ["priority"]),

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

  // Trip reports - imported from EffectIndex
  tripReports: defineTable(tripReport)
    .index("by_slug", ["slug"])
    .index("by_featured", ["featured"]),

  // Subjective effect articles - imported from EffectIndex
  subjectiveEffects: defineTable(subjectiveEffect)
    .index("by_slug", ["slug"])
    .index("by_featured", ["featured"]),

  // EffectIndex articles - intensity scales, substance analyses, methodology
  effectIndexArticles: defineTable(effectIndexArticle)
    .index("by_slug", ["slug"]),

  // Video and image replications of effects
  replications: defineTable(replication)
    .index("by_effect", ["effect_slug"])
    .index("by_slug", ["slug"])
    .index("by_artist", ["artist"]),

  memberships: defineTable(membership)
    .index("by_email", ["email"])
    .index("by_role", ["role"])
    .index("by_provider_account", ["provider", "providerAccountId"]),

  // Category layout - stores the manually curated psychoactive index structure
  // This is a single document containing the full layout configuration
  // @deprecated Use indexLayouts table instead
  categoryLayout: defineTable({
    version: v.number(),
    categories: v.array(v.object({
      key: v.string(),
      label: v.string(),
      iconKey: v.string(),
      sections: v.array(v.object({
        key: v.string(),
        label: v.string(),
        drugs: v.array(v.string()),  // Just slugs - names resolved client-side
      })),
      drugs: v.array(v.string()),    // Top-level drugs not in sections
      columns: v.optional(v.any()),  // Responsive column configuration
    })),
  }),

  // Site configuration - About page content and other global settings
  siteConfig: defineTable({
    key: v.string(),           // "about" for About page content
    aboutMarkdown: v.optional(v.string()),
    aboutSubtitle: v.optional(v.string()),
    founderProfileKeys: v.optional(v.array(v.string())),
    updatedAt: v.string(),
    updatedBy: v.optional(v.string()),
  }).index("by_key", ["key"]),

  // Index layouts - stores all category/classification index definitions
  // Replaces the bundled JSON files in src/data/indexes/
  indexLayouts: defineTable({
    type: v.union(v.literal("psychoactive"), v.literal("chemical"), v.literal("mechanism")),
    version: v.number(),
    categories: v.array(v.object({
      key: v.string(),
      label: v.string(),
      iconKey: v.string(),
      notes: v.optional(v.string()),
      columns: v.optional(v.any()),
      drugs: v.array(v.string()),
      sections: v.array(v.object({
        key: v.string(),
        label: v.string(),
        notes: v.optional(v.string()),
        link: v.optional(v.object({
          type: v.union(v.literal("chemicalClass"), v.literal("psychoactiveClass"), v.literal("mechanism")),
          value: v.string(),
        })),
        drugs: v.array(v.string()),
      })),
    })),
  }).index("by_type", ["type"]),
});
