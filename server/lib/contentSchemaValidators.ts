import { v } from "../../lib/postgres/runtime/values"
import {
  storedTripReportValidator,
  timelineEntryValidator,
  tripReportSubjectValidator,
  tripReportSubstanceValidator,
} from "../tripReportContract";

export const substanceArticle = v.object({
  id: v.union(v.number(), v.null()),
  title: v.string(),
  slug: v.optional(v.string()),
  priority: v.optional(v.union(
    v.literal("high"),
    v.literal("normal"),
    v.literal("low"),
    v.literal("hide_for_now"),
    v.null(),
  )),
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
  section_gaps: v.optional(v.any()),
  references: v.optional(v.any()),
  source_citations: v.optional(v.any()),
  citations: v.any(),
});

export const changelogEntry = v.object({
  entryId: v.string(),
  createdAt: v.string(),
  message: v.string(),
  markdown: v.string(),
  submittedBy: v.union(v.string(), v.null()),
  articles: v.array(v.object({
    id: v.number(),
    title: v.string(),
    slug: v.string(),
  })),
});

export const articleSource = v.object({
  slug: v.string(),
  substanceName: v.string(),
  sources: v.array(v.object({
    id: v.string(),
    fileName: v.string(),
    displayName: v.string(),
    size: v.number(),
    tokens: v.number(),
  })),
  contents: v.record(v.string(), v.string()),
});

export const prompt = v.object({
  key: v.string(),
  content: v.string(),
  updatedAt: v.string(),
  updatedBy: v.optional(v.string()),
});

export const quote = v.object({
  slug: v.string(),
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
  content: v.string(),
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

export const tripReport = storedTripReportValidator;

const tripReportSubmissionStatus = v.union(
  v.literal("submitted"),
  v.literal("reviewing"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("spam"),
  v.literal("exported"),
);

export const tripReportSubmissionDecisionLog = v.array(
  v.object({
    at: v.string(),
    actor: v.string(),
    from: v.optional(tripReportSubmissionStatus),
    to: tripReportSubmissionStatus,
    note: v.optional(v.string()),
    public_reason: v.optional(v.string()),
    migrated: v.optional(v.boolean()),
  }),
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
  decision_log: v.optional(tripReportSubmissionDecisionLog),
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

export const feedbackDecisionLog = v.array(
  v.object({
    at: v.string(),
    actor: v.string(),
    from: v.optional(articleFeedbackStatus),
    to: articleFeedbackStatus,
    note: v.optional(v.string()),
    public_reason: v.optional(v.string()),
    migrated: v.optional(v.boolean()),
    outcome: v.optional(v.union(v.literal("duplicate"), v.literal("explanation_provided"), v.literal("no_change_needed"))),
    linked_change: v.optional(v.object({
      kind: v.union(v.literal("proposal"), v.literal("revision")),
      id: v.string(),
    })),
  }),
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
  decision_log: v.optional(feedbackDecisionLog),
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
  decision_log: v.optional(feedbackDecisionLog),
  created_at: v.string(),
  updated_at: v.string(),
});

export const effectIndexArticle = v.object({
  slug: v.string(),
  title: v.string(),
  tags: v.array(v.string()),
  publication_status: v.optional(v.string()),
  featured: v.optional(v.boolean()),
  shortDescription: v.optional(v.string()),
  publicationDate: v.optional(v.string()),

  body_raw: v.string(),
  body_ast: v.optional(v.any()),

  authors: v.optional(v.array(v.string())),

  citations: v.optional(v.array(v.object({
    url: v.string(),
    text: v.string(),
  }))),

  kind: v.optional(v.union(v.literal("article"), v.literal("blog"))),
  status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
  bodyFormat: v.optional(v.union(v.literal("vcode"), v.literal("markdown"))),
  authorProfileKeys: v.optional(v.array(v.string())),
  coverImageUrl: v.optional(v.string()),
  teaser: v.optional(v.string()),
});
