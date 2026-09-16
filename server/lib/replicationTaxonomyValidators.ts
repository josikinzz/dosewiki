import { v } from "../../lib/postgres/runtime/values"

export const taxonomyConfidenceValidator = v.union(
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
);

export const replicationStatusValidator = v.union(
  v.literal("replication"),
  v.literal("not-replication"),
  v.literal("unclear"),
  v.literal("unreviewed"),
  v.literal("source-corrupt"),
);

export const viewingModeValidator = v.union(
  v.literal("open-eye"),
  v.literal("closed-eye"),
  v.literal("mixed"),
  v.literal("uncertain"),
);

export const viewingModeTagValidator = v.union(
  v.literal("open-eye"),
  v.literal("closed-eye"),
);

export const drugClassValidator = v.union(
  v.literal("psychedelics"),
  v.literal("dissociatives"),
  v.literal("deliriants"),
  v.literal("other"),
);

export const contentFamilyValidator = v.union(
  v.literal("experiential-replication"),
  v.literal("visionary-psychedelic-art"),
  v.literal("traditional-cultural-art"),
  v.literal("dark-surrealism"),
  v.literal("optical-perceptual-art"),
  v.literal("generative-abstract-art"),
  v.literal("effect-illustration"),
  v.literal("explanatory-figure"),
  v.literal("uncertain"),
);

export const titleDrugValidator = v.object({
  slug: v.string(),
  name: v.string(),
  class: drugClassValidator,
  matched_title_text: v.string(),
});

export const titleClassMentionValidator = v.object({
  class: drugClassValidator,
  matched_title_text: v.string(),
});

export const artistPrimaryTypeValidator = v.union(
  v.literal("replicator"),
  v.literal("traditional-psychedelic-artist"),
  v.literal("mixed"),
  v.literal("other"),
  v.literal("uncertain"),
);

export const artistTypeTagValidator = v.union(
  v.literal("replicator"),
  v.literal("traditional-psychedelic-artist"),
);

export const replicationTaxonomyPatchValidator = v.object({
  source_catalog_id: v.optional(v.string()),
  taxonomy_record_key: v.string(),
  replication_status: replicationStatusValidator,
  replication_status_confidence: taxonomyConfidenceValidator,
  replication_status_review_required: v.boolean(),
  viewing_mode: v.optional(viewingModeValidator),
  viewing_mode_tags: v.optional(v.array(viewingModeTagValidator)),
  viewing_mode_confidence: v.optional(taxonomyConfidenceValidator),
  viewing_mode_review_required: v.optional(v.boolean()),
  title_drugs: v.optional(v.array(titleDrugValidator)),
  title_class_mentions: v.optional(v.array(titleClassMentionValidator)),
  drug_classes: v.optional(v.array(drugClassValidator)),
  content_family: contentFamilyValidator,
  content_tags: v.array(v.string()),
  content_family_confidence: taxonomyConfidenceValidator,
  content_family_review_required: v.boolean(),
  taxonomy_review_required: v.boolean(),
  taxonomy_version: v.number(),
  taxonomy_source_digest: v.string(),
  taxonomy_updated_at: v.number(),
});

export const replicationTaxonomyEvidence = v.object({
  replication_id: v.id("replications"),
  source_catalog_id: v.optional(v.string()),
  taxonomy_record_key: v.optional(v.string()),
  replication_status: replicationStatusValidator,
  replication_status_confidence: taxonomyConfidenceValidator,
  replication_status_rationale: v.string(),
  viewing_mode: v.optional(viewingModeValidator),
  viewing_mode_confidence: v.optional(taxonomyConfidenceValidator),
  viewing_mode_rationale: v.optional(v.string()),
  content_family: v.optional(contentFamilyValidator),
  content_tags: v.optional(v.array(v.string())),
  content_family_confidence: v.optional(taxonomyConfidenceValidator),
  content_family_rationale: v.optional(v.string()),
  review_required: v.boolean(),
  taxonomy_version: v.number(),
  taxonomy_source_digest: v.string(),
  operation_id: v.string(),
  imported_at: v.number(),
});

export const replicationArtistTaxonomy = v.object({
  key: v.string(),
  display_name: v.string(),
  primary_type: artistPrimaryTypeValidator,
  artist_type_tags: v.array(artistTypeTagValidator),
  confidence: taxonomyConfidenceValidator,
  rationale: v.string(),
  review_required: v.boolean(),
  classification_review_count: v.number(),
  classification_review_agreement: v.optional(v.boolean()),
  replication_count: v.number(),
  taxonomy_version: v.number(),
  taxonomy_source_digest: v.string(),
  operation_id: v.string(),
  imported_at: v.number(),
});

export const replicationTaxonomyExpectedValidator = v.object({
  slug: v.string(),
  title: v.string(),
  artist: v.string(),
  type: v.union(v.literal("video"), v.literal("image"), v.literal("audio")),
  storage_id: v.union(v.string(), v.null()),
  r2_key: v.union(v.string(), v.null()),
  url: v.union(v.string(), v.null()),
  taxonomy_source_digest: v.union(v.string(), v.null()),
});

export const replicationTaxonomyUpdateValidator = v.object({
  id: v.id("replications"),
  expected: replicationTaxonomyExpectedValidator,
  taxonomy: replicationTaxonomyPatchValidator,
  evidence: v.object({
    replication_status_rationale: v.string(),
    viewing_mode_rationale: v.optional(v.string()),
    content_family_rationale: v.string(),
  }),
});

export const replicationArtistTaxonomyUpdateValidator = v.object({
  key: v.string(),
  display_name: v.string(),
  primary_type: artistPrimaryTypeValidator,
  artist_type_tags: v.array(artistTypeTagValidator),
  confidence: taxonomyConfidenceValidator,
  rationale: v.string(),
  review_required: v.boolean(),
  classification_review_count: v.number(),
  classification_review_agreement: v.optional(v.boolean()),
  replication_count: v.number(),
  taxonomy_version: v.number(),
  taxonomy_source_digest: v.string(),
  imported_at: v.number(),
  expected_source_digest: v.union(v.string(), v.null()),
});
