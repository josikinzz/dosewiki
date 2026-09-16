import { v } from "../../lib/postgres/runtime/values"
import {
  storedTripReportValidator,
  timelineEntryValidator,
  tripReportSubjectValidator,
  tripReportSubstanceValidator,
} from "../tripReportContract";

// Only validate the essential top-level fields for indexing
// All nested content uses v.any() for flexibility
export const substanceArticle = v.object({
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
export const changelogEntry = v.object({
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
export const articleSource = v.object({
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
export const prompt = v.object({
  key: v.string(),            // "generator" or "section_harm_potential", etc.
  content: v.string(),        // Markdown content
  updatedAt: v.string(),      // ISO timestamp
  updatedBy: v.optional(v.string()),
});

// Quote documents - extracted quotes per substance per section
export const quote = v.object({
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

export const citationEvidence = v.object({
  slug: v.string(),
  articleId: v.optional(v.union(v.number(), v.null())),
  section: v.string(),
  claimKey: v.string(),
  claimText: v.optional(v.string()),
  fieldPath: v.optional(v.string()),
  entailmentVerdict: v.optional(v.union(
    v.literal("entails"),
    v.literal("partial"),
    v.literal("does_not_entail"),
    v.literal("uncertain"),
  )),
  strictReviewEvidence: v.optional(v.object({
    decision: v.literal("approved"),
    reviewedBy: v.string(),
    reviewedAt: v.string(),
    claimKey: v.string(),
    fieldPath: v.string(),
    claimText: v.string(),
    referenceIds: v.array(v.string()),
    rationale: v.string(),
  })),
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
export const tripReport = storedTripReportValidator;

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

export const tripReportSubmission = v.object({
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

export const articleFeedback = v.object({
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

const siteFeedbackCategory = v.union(
  v.literal("article-request"),
  v.literal("technical"),
  v.literal("ui-design"),
  v.literal("performance"),
  v.literal("accessibility"),
  v.literal("misc"),
);

const siteFeedbackUrgency = v.union(
  v.literal("critical"),
  v.literal("high"),
  v.literal("normal"),
  v.literal("low"),
);

// Site-wide general feedback intake (/about/feedback). Shares the
// articleFeedback status machine; status values reuse articleFeedbackStatus.
export const siteFeedback = v.object({
  id: v.string(),
  status: articleFeedbackStatus,
  schema_version: v.number(),
  category: siteFeedbackCategory,
  urgency: v.optional(siteFeedbackUrgency),
  details: v.string(),
  page: v.optional(v.string()),
  email: v.optional(v.string()),
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
export const effectIndexArticle = v.object({
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

  // --- Generic Writing/Blog system (additive; every field optional so the
  // legacy Effect Index imports keep validating exactly as they are).
  // Absent `kind` means "article", absent `status` means "published", and
  // absent `bodyFormat` means the legacy VCode markup in `body_raw`.
  kind: v.optional(v.union(v.literal("article"), v.literal("blog"))),
  status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
  bodyFormat: v.optional(v.union(v.literal("vcode"), v.literal("markdown"))),
  authorProfileKeys: v.optional(v.array(v.string())),
  coverImageUrl: v.optional(v.string()),
  teaser: v.optional(v.string()),
});
