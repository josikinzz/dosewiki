import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  storedTripReportValidator,
  timelineEntryValidator,
  tripReportSubjectValidator,
  tripReportSubstanceValidator,
} from "./tripReportContract";
import { reagentTestDocumentValidator } from "./reagentTestContract";

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
  priority: v.optional(v.union(
    v.literal("high"),
    v.literal("normal"),
    v.literal("low"),
    v.literal("hide_for_now"),
    v.null(),
  )),
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
  section_gaps: v.optional(v.any()),
  references: v.optional(v.any()),
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
  contents: v.record(v.string(), v.string()),
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
  section: v.union(
    v.literal("summary"),
    v.literal("harm_potential"),
    v.literal("pharmacology"),
    v.literal("history_culture"),
    v.literal("dosage_duration"),
    v.literal("tolerance"),
    v.literal("legality"),
    v.literal("subjective_effects"),
  ),
  content: v.string(),        // Full markdown content
  updatedAt: v.string(),
  updatedBy: v.optional(v.string()),
});

const citationEvidence = v.object({
  slug: v.string(),
  articleId: v.optional(v.union(v.number(), v.null())),
  section: v.string(),
  claimKey: v.string(),
  claimText: v.optional(v.string()),
  fieldPath: v.optional(v.string()),
  referenceIds: v.array(v.string()),
  sourceName: v.optional(v.string()),
  sourceType: v.optional(v.string()),
  quality: v.optional(v.string()),
  status: v.union(
    v.literal("supported"),
    v.literal("needs_source"),
    v.literal("needs_review"),
    v.literal("approved"),
    v.literal("rejected"),
  ),
  statusReason: v.optional(v.string()),
  severity: v.union(v.literal("blocking"), v.literal("non_blocking")),
  confidence: v.optional(v.number()),
  supportingSnippet: v.optional(v.string()),
  supportRationale: v.optional(v.string()),
  supports: v.optional(v.array(v.object({
    sourceId: v.string(),
    sourceName: v.string(),
    referenceId: v.string(),
    sourceType: v.optional(v.union(v.string(), v.null())),
    quality: v.optional(v.union(v.string(), v.null())),
    supportingQuote: v.string(),
    rationale: v.string(),
    verifiedQuote: v.object({
      sourceId: v.string(),
      matchType: v.union(v.literal("exact"), v.literal("normalized_whitespace")),
      startOffset: v.union(v.number(), v.null()),
      endOffset: v.union(v.number(), v.null()),
    }),
  }))),
  diagnostics: v.optional(v.array(v.object({
    code: v.string(),
    message: v.string(),
    severity: v.union(v.literal("error"), v.literal("warning")),
    claimKey: v.optional(v.union(v.string(), v.null())),
  }))),
  provenance: v.optional(v.any()),
  createdAt: v.string(),
  updatedAt: v.string(),
  updatedBy: v.optional(v.string()),
});

// Trip report - imported from EffectIndex
const tripReport = storedTripReportValidator;

const tripReportSubmissionStatus = v.union(
  v.literal("submitted"),
  v.literal("reviewing"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("spam"),
  v.literal("exported"),
);

const tripReportSubmissionReport = v.object({
  title: v.string(),
  subject: tripReportSubjectValidator,
  substances: v.array(tripReportSubstanceValidator),
  introduction: v.optional(v.string()),
  onset: v.array(timelineEntryValidator),
  peak: v.array(timelineEntryValidator),
  offset: v.array(timelineEntryValidator),
  conclusion: v.optional(v.string()),
  tags: v.array(v.string()),
});

const tripReportSubmission = v.object({
  id: v.string(),
  status: tripReportSubmissionStatus,
  schema_version: v.number(),
  report: tripReportSubmissionReport,
  title: v.string(),
  author_name: v.string(),
  substance_names: v.array(v.string()),
  contact_email: v.optional(v.string()),
  may_contact: v.boolean(),
  publish_consent: v.boolean(),
  age_confirmed: v.boolean(),
  ip_hash: v.optional(v.string()),
  user_agent: v.optional(v.string()),
  honeypot_triggered: v.boolean(),
  review_notes: v.optional(v.string()),
  reviewed_by: v.optional(v.string()),
  reviewed_at: v.optional(v.string()),
  exported_trip_report_id: v.optional(v.id("tripReports")),
  exported_at: v.optional(v.string()),
  created_at: v.string(),
  updated_at: v.string(),
});

const articleFeedbackStatus = v.union(
  v.literal("new"),
  v.literal("reviewing"),
  v.literal("resolved"),
  v.literal("rejected"),
  v.literal("spam"),
);

const articleFeedbackCategory = v.union(
  v.literal("inaccurate"),
  v.literal("missing"),
  v.literal("source"),
  v.literal("broken-link"),
  v.literal("other"),
);

const articleFeedbackImportance = v.union(
  v.literal("critical"),
  v.literal("high"),
  v.literal("normal"),
  v.literal("low"),
);

const articleFeedback = v.object({
  id: v.string(),
  status: articleFeedbackStatus,
  schema_version: v.number(),
  substance_slug: v.string(),
  substance_title: v.string(),
  category: articleFeedbackCategory,
  importance: articleFeedbackImportance,
  details: v.string(),
  source_url: v.optional(v.string()),
  contact_email: v.optional(v.string()),
  ip_hash: v.optional(v.string()),
  user_agent: v.optional(v.string()),
  honeypot_triggered: v.boolean(),
  review_notes: v.optional(v.string()),
  reviewed_by: v.optional(v.string()),
  reviewed_at: v.optional(v.string()),
  created_at: v.string(),
  updated_at: v.string(),
});

// EffectIndex articles - intensity scales, substance analyses, methodology docs
const effectIndexArticle = v.object({
  slug: v.string(),           // URL-safe identifier (e.g., "dissociative-intensity-scale")
  title: v.string(),          // Display title
  tags: v.array(v.string()),  // Categorization (e.g., ["intensity scale", "dissociative"])
  // Optional so pre-existing rows validate; the article importer backfills it,
  // and the public reader drops rows without it.
  publication_status: v.optional(v.string()),
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

const replicationRightsStatus = v.union(
  v.literal("creator-retained"),
  v.literal("explicit-license"),
  v.literal("unknown"),
  v.literal("permission-granted"),
  v.literal("public-domain"),
);

const replicationRightsFields = {
  rights_status: v.optional(replicationRightsStatus),
  license_name: v.optional(v.string()),
  license_url: v.optional(v.string()),
  credit_line: v.optional(v.string()),
  source_url: v.optional(v.string()),
  rightsholder: v.optional(v.string()),
  permission_notes: v.optional(v.string()),
  removal_contact: v.optional(v.string()),
};

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
    artist_url: v.optional(v.string()),
    description: v.optional(v.string()),
    resource: v.string(),
    ...replicationRightsFields,
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

/**
 * What a stored media row *is*, as opposed to what it depicts.
 *
 * `replication` — an artist's attempt to reproduce a subjective effect. This is
 * what the public gallery, the artist credits, and the /effects surfaces mean by
 * "replication", and it is the only thing the table could express before.
 *
 * `figure` — an explanatory asset that is stored, credited, and rights-tracked in
 * exactly the same way but is not somebody's rendition of an experience: ECG and
 * EEG traces, Bristol stool charts, vertebral-column diagrams, molecule figures,
 * a brain connectome. These belong in the media store so their rights and credit
 * travel with them, but they must never be counted or shown as replications.
 *
 * ABSENCE MEANS `replication`. The column is optional precisely so the 247 rows
 * that predate it stay correct with no backfill: every one of them is a
 * replication, and reading `row.role ?? "replication"` gives that answer for free.
 * A required column would have made all 247 rows invalid the moment the schema
 * deployed. Read this column through `mediaRole()` in `src/types/replications.ts`
 * rather than comparing it directly, so the default lives in one place.
 *
 * Deliberately NOT indexed. An index over an optional field files the 247
 * undefined rows under `undefined`, so `.eq("role", "replication")` would return
 * zero of them — an index here would be a trap, not an optimization, until the
 * column is backfilled and required.
 */
const replicationRole = v.union(v.literal("replication"), v.literal("figure"));

/**
 * Storable media kinds. `audio` was added alongside `role`: 12 audio assets had
 * nowhere to live, 5 of them already carrying full rights metadata in the
 * separate `subjectiveEffects.audio_replications` column. Widening a union is
 * additive — no existing "image"/"video" row changes meaning.
 */
const replicationMediaType = v.union(
  v.literal("video"),
  v.literal("image"),
  v.literal("audio"),
);

// Stored media for effect articles: replications, and explanatory figures.
const replication = v.object({
  slug: v.string(),                    // URL-friendly identifier (e.g., "breathing-by-artist-name")
  title: v.string(),                   // Display title
  artist: v.string(),                  // Artist/creator name
  artist_url: v.optional(v.string()),  // Artist portfolio/social link
  role: v.optional(replicationRole),   // Absent === "replication"; see above
  type: replicationMediaType,          // "video" | "image" | "audio"
  storage_id: v.string(),              // Convex file storage ID (or placeholder for external URLs)
  /**
   * Owning effect, when there is one. Optional because some stored assets
   * genuinely have no effect: figures embedded in `effectIndexArticles`
   * (dmt, dxm, lucid-dreaming, meditation), page heroes, and a molecule diagram
   * that depicts no subjective effect at all. Every existing row sets it, so
   * relaxing `v.string()` to `v.optional(v.string())` changes nothing for them.
   */
  effect_slug: v.optional(v.string()),
  thumbnail_storage_id: v.optional(v.string()), // Video thumbnail storage ID
  url: v.optional(v.string()),         // Direct URL (external Convex storage or CDN)
  thumbnail_url: v.optional(v.string()), // Direct thumbnail URL (for videos)
  width: v.optional(v.number()),       // For responsive display
  height: v.optional(v.number()),
  format: v.string(),                  // File extension (mp4, jpg, etc.)
  file_size: v.optional(v.number()),   // In bytes
  duration: v.optional(v.number()),    // Video duration in seconds
  created_at: v.string(),              // ISO timestamp
  /**
   * Subjective effects this asset also depicts, as effect slugs.
   *
   * `effect_slug` answers "which effect owns this row" — one effect, the one
   * whose gallery and permalink the row belongs to. This column answers the
   * different question "what else is visible in it", which a single owning
   * slug cannot express: one image can show geometry, drifting, and colour
   * enhancement at once.
   *
   * Optional and additive: every existing row is correct with the column
   * absent, and absence means "not tagged yet", never "depicts nothing". No
   * public surface reads it yet — it is written and edited from the `/dev`
   * Replication Studio so the corpus can be tagged before anything is built
   * on top of the tags.
   */
  effect_tags: v.optional(v.array(v.string())),
  ...replicationRightsFields,
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

const generatedPublicationProfile = v.union(
  v.literal("summary"),
  v.literal("dosage_duration"),
  v.literal("subjective_effects"),
  v.literal("pharmacology"),
  v.literal("interactions"),
  v.literal("tolerance"),
  v.literal("harm_potential"),
  v.literal("history_culture"),
  v.literal("legality"),
);

const generatedPublicationOperation = v.object({
  proposalId: v.string(),
  payloadDigest: v.string(),
  artifactDigest: v.string(),
  manifestDigest: v.string(),
  rawResponseHash: v.string(),
  targetDeploymentFingerprint: v.string(),
  slug: v.string(),
  profile: generatedPublicationProfile,
  affectedPaths: v.array(v.string()),
  actorEmail: v.string(),
  reviewedBy: v.string(),
  reviewedAt: v.string(),
  previousHash: v.string(),
  nextHash: v.string(),
  hashVersion: v.literal("section-cas-v1"),
  createdAt: v.string(),
});

const contributorProfile = v.object({
  key: v.string(),
  displayName: v.string(),
  aliases: v.array(v.string()),
  avatarStorageId: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  bio: v.string(),
  // Free-text contributor title shown on the public profile ("Founder",
  // "Former Dev", "Replication Artist"). Carried over from the Effect Index
  // person records; unrelated to the admin/editor/viewer authorization role.
  role: v.optional(v.string()),
  links: v.array(
    v.object({
      label: v.string(),
      url: v.string(),
    }),
  ),
  membershipEmail: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
  updatedBy: v.optional(v.string()),
});

// Lossless Effect Index source records retained for a future EI-specific
// deployment. This table is intentionally not part of any DoseWiki read path.
const effectIndexArchiveRecord = v.object({
  kind: v.string(),
  key: v.string(),
  payload: v.any(),
  importedAt: v.number(),
});

export default defineSchema({
  // Main substance index table - each document is a complete SubstanceArticle
  substanceIndex: defineTable(substanceArticle)
    .index("by_title", ["title"])
    .index("by_article_id", ["id"])
    .index("by_slug", ["slug"])
    .index("by_priority", ["priority"]),

  // Point-in-time ProtestKit snapshot keyed by canonical DoseWiki slug.
  reagentTests: defineTable(reagentTestDocumentValidator)
    .index("by_slug", ["slug"])
    .index("by_snapshot_hash", ["snapshotHash"]),

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

  citationEvidence: defineTable(citationEvidence)
    .index("by_slug", ["slug"])
    .index("by_slug_section", ["slug", "section"])
    .index("by_slug_claim", ["slug", "claimKey"])
    .index("by_status", ["status"]),

  // Successful reviewed section publications. The proposal ID index is the
  // idempotency boundary and the row is inserted in the article patch transaction.
  generatedPublicationOperations: defineTable(generatedPublicationOperation)
    .index("by_proposal_id", ["proposalId"])
    .index("by_slug_created", ["slug", "createdAt"]),

  // Trip reports - imported from EffectIndex
  tripReports: defineTable(tripReport)
    .index("by_slug", ["slug"])
    .index("by_featured", ["featured"]),

  // Private public-submission intake. Rows stay editor-only until promoted into tripReports.
  tripReportSubmissions: defineTable(tripReportSubmission)
    .index("by_status_created", ["status", "created_at"])
    .index("by_created_at", ["created_at"])
    .index("by_public_id", ["id"]),

  // Private per-article "report an issue / suggest an edit" intake. Editor-only; never rendered publicly.
  articleFeedback: defineTable(articleFeedback)
    .index("by_status_created", ["status", "created_at"])
    .index("by_created_at", ["created_at"])
    .index("by_public_id", ["id"])
    .index("by_substance", ["substance_slug", "created_at"]),

  // Subjective effect articles - imported from EffectIndex
  subjectiveEffects: defineTable(subjectiveEffect)
    .index("by_slug", ["slug"])
    .index("by_featured", ["featured"]),

  // EffectIndex articles - intensity scales, substance analyses, methodology
  effectIndexArticles: defineTable(effectIndexArticle)
    .index("by_slug", ["slug"]),

  // Raw Effect Index people, profiles, and posts. Never render from this table.
  effectIndexArchive: defineTable(effectIndexArchiveRecord)
    .index("by_kind_key", ["kind", "key"]),

  // Video and image replications of effects
  replications: defineTable(replication)
    .index("by_effect", ["effect_slug"])
    .index("by_slug", ["slug"])
    .index("by_artist", ["artist"]),

  memberships: defineTable(membership)
    .index("by_email", ["email"])
    .index("by_role", ["role"])
    .index("by_provider_account", ["provider", "providerAccountId"]),

  contributorProfiles: defineTable(contributorProfile)
    .index("by_key", ["key"])
    .index("by_membership_email", ["membershipEmail"]),

  // Category layout - stores the manually curated psychoactive index structure
  // as a single document containing the full layout configuration.
  // The public /substances page still reads this table; the index-layout save
  // route (src/app/api/save-to-convex/route.ts) mirrors indexLayouts writes
  // into it to keep the public read in sync. Durable fix: point public reads
  // at the indexLayouts table, then retire this mirror.
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

  // Canonical molecule depictions for public substance/class pages and the /dev
  // Molecules editor. One document per slug. `svg` is the live brand-palette
  // display asset; `molblock` is the re-editable source (coords + stereo).
  // Static /molecules/*.svg files are retained only as a read fallback.
  moleculeOverrides: defineTable({
    slug: v.string(),
    svg: v.string(),
    molblock: v.string(),
    smiles: v.optional(v.string()),
    // Bond indices (into the molblock's bond block) drawn with the bold line
    // weight in every renderer. Absent/empty means no bold bonds.
    boldBonds: v.optional(v.array(v.number())),
    source: v.optional(
      v.union(v.literal("seeded"), v.literal("editor"), v.literal("template")),
    ),
    updatedAt: v.string(),
    updatedBy: v.optional(v.string()),
  }).index("by_slug", ["slug"]),

  // Editor-authored plain-scaffold orientation templates. These are separate
  // from both substance/class depiction overrides and public generic class
  // structures; saving one never changes a published molecule.
  moleculeClassTemplates: defineTable({
    classKey: v.string(),
    molblock: v.string(),
    // Bond indices drawn with the bold line weight while editing the template.
    // Editor-only cosmetics: applies copy coordinates, never bold, to members.
    boldBonds: v.optional(v.array(v.number())),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  }).index("by_class_key", ["classKey"]),

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
