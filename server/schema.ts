import { glossaryFeedbackFields, glossaryReactionFields } from "./lib/glossaryFeedbackValidators";
import { defineSchema, defineTable } from "../lib/postgres/runtime/schema";
import { v } from "../lib/postgres/runtime/values";
import { publicReadIndexTables } from "./lib/publicReadIndexSchema";
import {
  articleFeedback,
  articleSource,
  changelogEntry,
  citationEvidence,
  effectIndexArticle,
  prompt,
  quote,
  siteFeedback,
  substanceArticle,
  tripReport,
  tripReportSubmission,
} from "./lib/contentSchemaValidators";
import {
  replication,
  subjectiveEffect,
  replicationPlaylist,
  substanceGallery,
} from "./lib/effectMediaSchemaValidators";
import { replicationDateResearch } from "./lib/replicationDateValidators";
import { replicationSourceAttribution } from "./lib/replicationAttributionValidators";
import { replicationDuplicateReconciliation } from "./lib/replicationDuplicateValidators";
import {
  contributorAliasEvidenceValidator,
  contributorAvatarHistoryValidator,
  contributorReplicatorVerificationValidator,
  contributorIdentityTokenSnapshotValidator,
  contributorIdentitySnapshotMaterializationValidator,
  replicationIdentityAttributionValidator,
  replicationIdentityProfileBindingValidator,
  replicationIdentitySocialOperationValidator,
  replicationIdentitySocialOperationItemValidator,
  replicationSocialAssetValidator,
} from "./lib/replicationIdentitySocialValidators";
import {
  contributorProfileMergeItemValidator,
  contributorProfileMergeOperationValidator,
} from "./lib/contributorProfileMergeValidators";
import {
  replicationArtistTaxonomy,
  replicationTaxonomyEvidence,
} from "./lib/replicationTaxonomyValidators";
import { reagentTestDocumentValidator } from "./reagentTestContract";
import { changeProposal, inviteCode, membership } from "./lib/accessSchemaValidators";

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
  avatarR2Key: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  avatarSha256: v.optional(v.string()),
  avatarProvenance: v.optional(v.string()),
  bio: v.string(),
  role: v.optional(v.string()),
  links: v.array(
    v.object({
      label: v.string(),
      url: v.string(),
    }),
  ),
  membershipEmail: v.optional(v.string()),
  replicationOrder: v.optional(v.array(v.string())),
  reportOrder: v.optional(v.array(v.string())),
  exclude_from_gallery: v.optional(v.boolean()),
  archival: v.optional(v.boolean()),
  approved_replicator: v.optional(v.boolean()),
  staffNote: v.optional(
    v.object({
      markdown: v.string(),
      attribution: v.optional(v.string()),
    }),
  ),
  createdAt: v.string(),
  updatedAt: v.string(),
  updatedBy: v.optional(v.string()),
  mergedIntoProfileId: v.optional(v.id("contributorProfiles")),
  mergedIntoKey: v.optional(v.string()),
  mergedByOperationId: v.optional(v.string()),
  mergedAt: v.optional(v.number()),
});

const effectIndexArchiveRecord = v.object({
  kind: v.string(),
  key: v.string(),
  payload: v.any(),
  importedAt: v.number(),
});

const warningBannerPreset = v.object({
  key: v.string(),
  tone: v.union(v.literal("danger"), v.literal("unsafe"), v.literal("caution")),
  icon: v.string(),
  severityLabel: v.string(),
  headline: v.string(),
  points: v.array(v.string()),
  enabled: v.boolean(),
  allSubstances: v.optional(v.boolean()),
  enabledSlugs: v.array(v.string()),
  updatedAt: v.string(),
  updatedBy: v.optional(v.string()),
});

export default defineSchema({
  ...publicReadIndexTables,
  publicCachePublications: defineTable({
    key: v.string(),
    target: v.object({
      kind: v.string(),
      slug: v.optional(v.string()),
      locale: v.optional(v.string()),
      dependency: v.optional(v.union(
        v.literal("detail"),
        v.literal("content"),
        v.literal("membership"),
      )),
    }),
    revision: v.optional(v.union(v.string(), v.null())),
    generation: v.number(),
    pending: v.boolean(),
    committedAt: v.number(),
    nextAttemptAt: v.number(),
    attempts: v.number(),
    receipts: v.array(v.any()),
    deadLetteredAt: v.optional(v.number()),
  }).index("by_key", ["key"]).index("by_due", ["pending", "nextAttemptAt"]).index("by_fresh", ["pending", "attempts", "nextAttemptAt"]),
  substanceIndex: defineTable(substanceArticle)
    .index("by_title", ["title"])
    .index("by_article_id", ["id"])
    .index("by_slug", ["slug"])
    .index("by_priority", ["priority"]),

  articleDrafts: defineTable({
    slug: v.string(),
    ownerEmail: v.string(),
    article: v.optional(substanceArticle),
    baseHash: v.string(),
    version: v.number(),
    updatedAt: v.string(),
    revisionOf: v.optional(v.id("changeProposals")),
  }).index("by_owner_slug", ["ownerEmail", "slug"]),

  articleProposalTargets: defineTable({
    slug: v.string(),
    ownerEmail: v.string(),
    proposalId: v.id("changeProposals"),
    createdAt: v.string(),
  }).index("by_slug_created", ["slug", "createdAt"])
    .index("by_owner_slug_created", ["ownerEmail", "slug", "createdAt"])
    .index("by_proposal_slug", ["proposalId", "slug"]),

  articleRevisions: defineTable({
    slug: v.string(),
    changeId: v.string(),
    actorEmail: v.string(),
    actorRole: v.string(),
    before: substanceArticle,
    after: substanceArticle,
    baseHash: v.string(),
    resultHash: v.string(),
    summary: v.string(),
    createdAt: v.string(),
    restoredFrom: v.optional(v.id("articleRevisions")),
  }).index("by_slug", ["slug"])
    .index("by_actor_change", ["actorEmail", "changeId"]),

  articleBatchReceipts: defineTable({
    ownerEmail: v.string(),
    operationId: v.string(),
    fingerprintVersion: v.number(),
    fingerprint: v.string(),
    resultVersion: v.number(),
    result: v.any(),
  }).index("by_owner_operation", ["ownerEmail", "operationId"]),

  articleDraftReceipts: defineTable({
    ownerEmail: v.string(),
    changeId: v.string(),
    fingerprint: v.string(),
    result: v.any(),
  }).index("by_owner_change", ["ownerEmail", "changeId"]),

  replicationEditReceipts: defineTable({
    requestId: v.string(),
    actorEmail: v.string(),
    actorRole: v.string(),
    operation: v.union(v.literal("canonical-metadata"), v.literal("collection-curation")),
    expectedRevision: v.string(),
    publications: v.array(v.string()),
    target: v.string(),
    before: v.any(),
    after: v.any(),
    createdAt: v.string(),
  }).index("by_actor_request", ["actorEmail", "requestId"])
    .index("by_target", ["target"]),

  narrativeRevisions: defineTable({
    kind: v.union(v.literal("effect"), v.literal("writing")),
    key: v.string(),
    documentId: v.string(),
    operationId: v.string(),
    actorEmail: v.string(),
    actorRole: v.string(),
    before: v.any(),
    after: v.any(),
    baseRevision: v.string(),
    revision: v.string(),
    createdAt: v.string(),
    requestHash: v.optional(v.string()),
    publications: v.optional(v.array(v.string())),
  }).index("by_target", ["kind", "key"])
    .index("by_document", ["kind", "documentId"])
    .index("by_operation", ["kind", "operationId"]),

  warningBannerRevisions: defineTable({
    key: v.string(),
    changeId: v.string(),
    requestHash: v.string(),
    actorEmail: v.string(),
    actorRole: v.string(),
    scope: v.union(v.literal("assignment"), v.literal("preset")),
    slug: v.optional(v.string()),
    operation: v.union(v.literal("publish"), v.literal("remove"), v.literal("restore")),
    before: v.any(),
    after: v.any(),
    baseHash: v.string(),
    resultHash: v.string(),
    createdAt: v.string(),
    affectedSlugs: v.array(v.string()),
    allSubstances: v.boolean(),
    publications: v.array(v.string()),
  }).index("by_key", ["key"])
    .index("by_change", ["changeId"]),

  reagentTests: defineTable(reagentTestDocumentValidator)
    .index("by_slug", ["slug"])
    .index("by_snapshot_hash", ["snapshotHash"]),

  changelog: defineTable(changelogEntry)
    .index("by_entry_id", ["entryId"])
    .index("by_created_at", ["createdAt"])
    .index("by_submitted_by", ["submittedBy"]),

  articleSources: defineTable(articleSource)
    .index("by_slug", ["slug"]),

  prompts: defineTable(prompt)
    .index("by_key", ["key"]),

  quotes: defineTable(quote)
    .index("by_slug_section", ["slug", "section"])
    .index("by_section", ["section"]),

  citationEvidence: defineTable(citationEvidence)
    .index("by_slug", ["slug"])
    .index("by_slug_section", ["slug", "section"])
    .index("by_slug_claim", ["slug", "claimKey"])
    .index("by_status", ["status"]),

  generatedPublicationOperations: defineTable(generatedPublicationOperation)
    .index("by_proposal_id", ["proposalId"])
    .index("by_slug_created", ["slug", "createdAt"]),

  tripReports: defineTable(tripReport)
    .index("by_slug", ["slug"])
    .index("by_owner_email", ["owner_email"])
    .index("by_featured", ["featured"])
    .index("by_subject_profile_key", ["subject.profile_key"]),

  tripReportSubstances: defineTable({
    report_id: v.id("tripReports"),
    name_lower: v.string(),
  })
    .index("by_name_lower", ["name_lower"])
    .index("by_report", ["report_id"]),

  tripReportSubmissions: defineTable(tripReportSubmission)
    .index("by_status_created", ["status", "created_at"])
    .index("by_created_at", ["created_at"])
    .index("by_public_id", ["id"]),

  articleFeedback: defineTable(articleFeedback)
    .index("by_status_created", ["status", "created_at"])
    .index("by_created_at", ["created_at"])
    .index("by_public_id", ["id"])
    .index("by_substance", ["substance_slug", "created_at"]),

  glossaryFeedback: defineTable(glossaryFeedbackFields)
    .index("by_locale_created", ["locale", "created_at"])
    .index("by_visitor_id", ["visitor", "id"]),
  glossaryReactionEvents: defineTable(glossaryReactionFields)
    .index("by_version_visitor", ["locale", "term", "version", "visitor", "created_at"])
    .index("by_visitor_id", ["visitor", "id"]),

  siteFeedback: defineTable(siteFeedback)
    .index("by_status_created", ["status", "created_at"])
    .index("by_created_at", ["created_at"])
    .index("by_public_id", ["id"]),

  mailingListSubscribers: defineTable({
    email: v.string(),
    list: v.union(
      v.literal("josiekins"),
      v.literal("dosewiki"),
      v.literal("effectindex"),
      v.literal("mindstate"),
    ),
    status: v.union(
      v.literal("subscribed"),
      v.literal("spam"),
      v.literal("unsubscribed"),
    ),
    created_at: v.number(),
    ip_hash: v.optional(v.string()),
    user_agent: v.optional(v.string()),
    honeypot_triggered: v.boolean(),
  })
    .index("by_email_list", ["email", "list"])
    .index("by_list_status", ["list", "status"]),

  subjectiveEffects: defineTable(subjectiveEffect)
    .index("by_slug", ["slug"])
    .index("by_featured", ["featured"]),

  effectIndexArticles: defineTable(effectIndexArticle)
    .index("by_slug", ["slug"])
    .index("by_kind_status_date", ["kind", "status", "publicationDate"])
    .index("by_featured", ["featured"]),

  effectIndexArchive: defineTable(effectIndexArchiveRecord)
    .index("by_kind_key", ["kind", "key"]),

  replications: defineTable(replication)
    .index("by_effect", ["effect_slug"])
    .index("by_slug", ["slug"])
    .index("by_artist", ["artist"])
    .index("by_source_sha256", ["source_sha256"])
    .index("by_source_catalog_id", ["source_catalog_id"])
    .index("by_taxonomy_record_key", ["taxonomy_record_key"])
    .index("by_replication_status", ["replication_status"]),

  replicationSourceAttribution: defineTable(replicationSourceAttribution)
    .index("by_replication_id", ["replication_id"])
    .index("by_source_catalog_id", ["source_catalog_id"])
    .index("by_source_sha256", ["source_sha256"]),

  replicationIdentityAttributions: defineTable(replicationIdentityAttributionValidator)
    .index("by_replication_id", ["replication_id"])
    .index("by_poster_profile_id", ["poster_profile_id"])
    .index("by_creator_profile_id", ["creator_profile_id"]),

  contributorAliasEvidence: defineTable(contributorAliasEvidenceValidator)
    .index("by_profile_id", ["profile_id"])
    .index("by_profile_id_and_normalized_alias", ["profile_id", "normalized_alias"])
    .index("by_normalized_alias", ["normalized_alias"]),

  contributorIdentityTokenSnapshots: defineTable(contributorIdentityTokenSnapshotValidator)
    .index("by_snapshot_digest_and_normalized_token", ["snapshot_digest", "normalized_token"]),

  contributorIdentitySnapshotMaterializations: defineTable(contributorIdentitySnapshotMaterializationValidator)
    .index("by_snapshot_digest", ["snapshot_digest"])
    .index("by_operation_id", ["operation_id"]),

  contributorAvatarHistory: defineTable(contributorAvatarHistoryValidator)
    .index("by_profile_id", ["profile_id"])
    .index("by_profile_id_and_recorded_at", ["profile_id", "recorded_at"])
    .index("by_profile_id_and_media_digest", ["profile_id", "media_digest"]),

  contributorReplicatorVerifications: defineTable(contributorReplicatorVerificationValidator)
    .index("by_profile_id", ["profile_id"])
    .index("by_status", ["status"]),

  replicationSocialAssets: defineTable(replicationSocialAssetValidator)
    .index("by_entity_kind_and_entity_key", ["entity_kind", "entity_key"])
    .index("by_entity_kind_and_entity_key_and_variant", ["entity_kind", "entity_key", "variant"])
    .index("by_status", ["status"]),

  replicationIdentitySocialOperations: defineTable(replicationIdentitySocialOperationValidator)
    .index("by_operation_id", ["operation_id"])
    .index("by_rollback_of", ["rollback_of"])
    .index("by_kind_and_created_at", ["kind", "created_at"]),

  replicationIdentitySocialOperationItems: defineTable(replicationIdentitySocialOperationItemValidator)
    .index("by_item_operation_id", ["item_operation_id"])
    .index("by_batch_operation_id", ["batch_operation_id"]),

  replicationIdentityProfileBindings: defineTable(replicationIdentityProfileBindingValidator)
    .index("by_artist_id", ["artist_id"])
    .index("by_profile_id", ["profile_id"]),

  contributorProfileMergeOperations: defineTable(contributorProfileMergeOperationValidator)
    .index("by_operation_id", ["operation_id"])
    .index("by_rollback_operation_id", ["rollback_operation_id"])
    .index("by_source_profile_id", ["source_profile_id"])
    .index("by_target_profile_id", ["target_profile_id"]),

  contributorProfileMergeItems: defineTable(contributorProfileMergeItemValidator)
    .index("by_operation_id_and_ordinal", ["operation_id", "ordinal"]),

  replicationDuplicateReconciliations: defineTable(replicationDuplicateReconciliation)
    .index("by_component_id", ["component_id"])
    .index("by_keeper_replication_id", ["keeper_replication_id"])
    .index("by_suppressed_replication_id", ["suppressed_replication_id"]),

  replicationDateResearch: defineTable(replicationDateResearch)
    .index("by_replication_id", ["replication_id"]),

  replicationTaxonomyEvidence: defineTable(replicationTaxonomyEvidence)
    .index("by_replication_id", ["replication_id"])
    .index("by_replication_digest", ["replication_id", "taxonomy_source_digest"])
    .index("by_source_catalog_id", ["source_catalog_id"])
    .index("by_taxonomy_record_key", ["taxonomy_record_key"]),

  replicationArtistTaxonomy: defineTable(replicationArtistTaxonomy)
    .index("by_key", ["key"]),

  substanceGalleries: defineTable(substanceGallery)
    .index("by_substance", ["substance_slug"]),

  replicationPlaylists: defineTable(replicationPlaylist)
    .index("by_key", ["key"])
    .index("by_owner_email", ["owner_email"]),

  contentRevisions: defineTable({
    table: v.union(
      v.literal("contributorProfiles"),
      v.literal("replicationPlaylists"),
      v.literal("tripReports"),
      v.literal("copyBlocks"),
      v.literal("siteConfig"),
      v.literal("indexLayouts"),
    ),
    key: v.string(),
    action: v.union(v.literal("update"), v.literal("remove"), v.literal("merge"), v.literal("create")),
    before: v.any(),
    actorEmail: v.string(),
    actorRole: v.string(),
    createdAt: v.string(),
    after: v.optional(v.any()),
    operationId: v.optional(v.string()),
    revision: v.optional(v.string()),
    publications: v.optional(v.array(v.string())),
    requestIdentity: v.optional(v.string()),
    clientRequestIdentity: v.optional(v.string()),
    requestHash: v.optional(v.string()),
  })
    .index("by_table_key", ["table", "key"])
    .index("by_operation", ["table", "key", "operationId"])
    .index("by_created_at", ["createdAt"]),

  memberships: defineTable(membership)
    .index("by_email", ["email"])
    .index("by_username", ["username"])
    .index("by_role", ["role"])
    .index("by_provider_account", ["provider", "providerAccountId"])
    .index("by_reset_token_hash", ["resetTokenHash"]),

  inviteCodes: defineTable(inviteCode)
    .index("by_code_hash", ["codeHash"])
    .index("by_created_at", ["createdAt"]),

  contributorProfiles: defineTable(contributorProfile)
    .index("by_key", ["key"])
    .index("by_display_name", ["displayName"])
    .index("by_membership_email", ["membershipEmail"]),

  categoryLayout: defineTable({
    version: v.number(),
    categories: v.array(v.object({
      key: v.string(),
      label: v.string(),
      iconKey: v.string(),
      sections: v.array(v.object({
        key: v.string(),
        label: v.string(),
        drugs: v.array(v.string()),
      })),
      drugs: v.array(v.string()),
      columns: v.optional(v.any()),
    })),
  }),

  siteConfig: defineTable({
    key: v.string(),
    aboutMarkdown: v.optional(v.string()),
    aboutSubtitle: v.optional(v.string()),
    founderProfileKeys: v.optional(v.array(v.string())),
    translationCredits: v.optional(v.record(v.string(), v.array(v.object({
      profileKey: v.string(),
      contribution: v.string(),
    })))),
    featuredReplicationSlugs: v.optional(v.array(v.string())),
    bannerIconSize: v.optional(v.number()),
    updatedAt: v.string(),
    updatedBy: v.optional(v.string()),
  }).index("by_key", ["key"]),

  copyBlocks: defineTable({
    key: v.string(),
    flavor: v.optional(v.string()),
    kind: v.union(v.literal("markdown"), v.literal("plain"), v.literal("list")),
    body: v.optional(v.string()),
    items: v.optional(v.array(v.string())),
    label: v.string(),
    group: v.string(),
    updatedAt: v.string(),
    updatedBy: v.optional(v.string()),
  })
    .index("by_key", ["key"])
    .index("by_group", ["group"]),

  warningBannerPresets: defineTable(warningBannerPreset).index("by_key", ["key"]),

  moleculeOverrides: defineTable({
    slug: v.string(),
    svg: v.string(),
    molblock: v.string(),
    smiles: v.optional(v.string()),
    boldBonds: v.optional(v.array(v.number())),
    source: v.optional(
      v.union(v.literal("seeded"), v.literal("editor"), v.literal("template")),
    ),
    updatedAt: v.string(),
    updatedBy: v.optional(v.string()),
  }).index("by_slug", ["slug"]),

  moleculeClassTemplates: defineTable({
    classKey: v.string(),
    molblock: v.string(),
    boldBonds: v.optional(v.array(v.number())),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  }).index("by_class_key", ["classKey"]),

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

  changeProposals: defineTable(changeProposal)
    .index("by_status", ["status"])
    .index("by_proposed_by", ["proposedBy"])
    .index("by_proposed_by_status", ["proposedBy", "status"])
    .index("by_created_at", ["createdAt"]),

  inboxClaims: defineTable({
    source: v.union(v.literal("citations"), v.literal("proposals"), v.literal("review-recommendations")),
    item_id: v.string(),
    claimed_by: v.string(),
    claimed_at: v.string(),
  }).index("by_source_item", ["source", "item_id"]),
});
