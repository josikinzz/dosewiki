import { v } from "../../lib/postgres/runtime/values"
import { replicationDateInfo } from "./replicationDateValidators";
import {
  contentFamilyValidator,
  drugClassValidator,
  replicationStatusValidator,
  taxonomyConfidenceValidator,
  titleClassMentionValidator,
  titleDrugValidator,
  viewingModeTagValidator,
  viewingModeValidator,
} from "./replicationTaxonomyValidators";

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

export const subjectiveEffect = v.object({
  slug: v.string(),
  name: v.string(),
  tags: v.array(v.string()),
  featured: v.optional(v.boolean()),

  summary: v.string(),
  description_raw: v.string(),
  description_ast: v.optional(v.any()),
  long_summary_raw: v.optional(v.string()),
  long_summary_ast: v.optional(v.any()),
  analysis_raw: v.optional(v.string()),
  analysis_ast: v.optional(v.any()),
  style_variations_raw: v.optional(v.string()),
  style_variations_ast: v.optional(v.any()),
  personal_commentary_raw: v.optional(v.string()),
  personal_commentary_ast: v.optional(v.any()),

  social_media_image: v.optional(v.string()),
  gallery_order: v.optional(v.array(v.string())),
  audio_replications: v.optional(v.array(v.object({
    title: v.string(),
    artist: v.string(),
    artist_url: v.optional(v.string()),
    description: v.optional(v.string()),
    resource: v.string(),
    ...replicationRightsFields,
  }))),

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

  subarticles: v.optional(v.array(v.object({
    id: v.string(),
    title: v.string(),
  }))),

  contributors: v.optional(v.array(v.string())),
});

const replicationRole = v.union(v.literal("replication"), v.literal("figure"));

const replicationMediaType = v.union(
  v.literal("video"),
  v.literal("image"),
  v.literal("audio"),
);

export const replicationPublicationState = v.union(
  v.literal("published"),
  v.literal("unpublished"),
  v.literal("duplicate-suppressed"),
);

export const replication = v.object({
  slug: v.string(),
  title: v.string(),
  artist: v.string(),
  artist_url: v.optional(v.string()),
  role: v.optional(replicationRole),
  publication_state: v.optional(replicationPublicationState),
  duplicate_of_replication_id: v.optional(v.id("replications")),
  duplicate_evidence_digest: v.optional(v.string()),
  duplicate_operation_id: v.optional(v.string()),
  duplicate_suppressed_at: v.optional(v.number()),
  type: replicationMediaType,
  storage_id: v.optional(v.string()),
  effect_slug: v.optional(v.string()),
  showcase_excluded: v.optional(v.boolean()),
  thumbnail_storage_id: v.optional(v.string()),
  preview_storage_id: v.optional(v.string()),
  motion_storage_id: v.optional(v.string()),
  motion_poster_storage_id: v.optional(v.string()),
  r2_key: v.optional(v.string()),
  thumbnail_r2_key: v.optional(v.string()),
  preview_r2_key: v.optional(v.string()),
  motion_r2_key: v.optional(v.string()),
  motion_poster_r2_key: v.optional(v.string()),
  url: v.optional(v.string()),
  thumbnail_url: v.optional(v.string()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  format: v.string(),
  file_size: v.optional(v.number()),
  duration: v.optional(v.number()),
  has_audio: v.optional(v.boolean()),
  created_at: v.string(),
  date_info: v.optional(replicationDateInfo),
  effect_tags: v.optional(v.array(v.string())),
  source_sha256: v.optional(v.string()),
  source_catalog_id: v.optional(v.string()),
  taxonomy_record_key: v.optional(v.string()),
  replication_status: v.optional(replicationStatusValidator),
  replication_status_confidence: v.optional(taxonomyConfidenceValidator),
  replication_status_review_required: v.optional(v.boolean()),
  viewing_mode: v.optional(viewingModeValidator),
  viewing_mode_tags: v.optional(v.array(viewingModeTagValidator)),
  viewing_mode_confidence: v.optional(taxonomyConfidenceValidator),
  viewing_mode_review_required: v.optional(v.boolean()),
  title_drugs: v.optional(v.array(titleDrugValidator)),
  title_class_mentions: v.optional(v.array(titleClassMentionValidator)),
  drug_classes: v.optional(v.array(drugClassValidator)),
  content_family: v.optional(contentFamilyValidator),
  content_tags: v.optional(v.array(v.string())),
  content_family_confidence: v.optional(taxonomyConfidenceValidator),
  content_family_review_required: v.optional(v.boolean()),
  taxonomy_review_required: v.optional(v.boolean()),
  taxonomy_version: v.optional(v.number()),
  taxonomy_source_digest: v.optional(v.string()),
  taxonomy_updated_at: v.optional(v.number()),
  ...replicationRightsFields,
});

export const substanceGallery = v.object({
  substance_slug: v.string(),
  curated_slugs: v.array(v.string()),
  removed_slugs: v.array(v.string()),
  carousel_order: v.optional(v.array(v.string())),
  disabled: v.optional(v.boolean()),
  updated_at: v.string(),
  updated_by: v.optional(v.string()),
  archived_at: v.optional(v.string()),
  archived_by: v.optional(v.string()),
});

export const replicationPlaylist = v.object({
  key: v.string(),
  owner_email: v.optional(v.string()),
  title: v.string(),
  replication_slugs: v.array(v.string()),
  updated_at: v.string(),
  updated_by: v.optional(v.string()),
  archived_at: v.optional(v.string()),
  archived_by: v.optional(v.string()),
});
