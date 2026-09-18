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

/**
 * Native document schema for DoseWiki.
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


// One row per account. `email` is the actor key every write is stamped with;
// `username` is what the person types at sign-in. `viewer` is a legacy stored
// value from the retired GitHub sign-in and grants nothing.
export const membershipRoleValidator = v.union(
  v.literal("admin"),
  v.literal("editor"),
  v.literal("editor_translator"),
  v.literal("translator"),
  v.literal("contributor"),
  v.literal("viewer"),
);

const membership = v.object({
  email: v.string(),
  username: v.optional(v.string()),
  passwordHash: v.optional(v.string()),
  passwordUpdatedAt: v.optional(v.string()),
  resetTokenHash: v.optional(v.string()),
  resetTokenExpiresAt: v.optional(v.string()),
  invitedBy: v.optional(v.string()),
  inviteCodeId: v.optional(v.id("inviteCodes")),
  bannedAt: v.optional(v.string()),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  role: membershipRoleValidator,
  glossaryLocales: v.optional(v.array(v.string())),
  provider: v.optional(v.string()),
  providerAccountId: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
  lastSeenAt: v.optional(v.string()),
});

// Invite codes: the only way an account is created. The plaintext is shown
// once at mint time; only its hash is stored.
const inviteCode = v.object({
  codeHash: v.string(),
  role: v.union(v.literal("editor"), v.literal("translator"), v.literal("editor_translator"), v.literal("contributor")),
  glossaryLocales: v.optional(v.array(v.string())),
  createdBy: v.string(),
  createdAt: v.string(),
  expiresAt: v.string(),
  maxUses: v.number(),
  redemptions: v.array(v.object({ email: v.string(), at: v.string() })),
  revokedAt: v.optional(v.string()),
  note: v.optional(v.string()),
});

// Editor change proposals: one staged commit-panel save per row, held for an
// admin. `payload` is the exact save-article body the shell built; `targets`
// pins each production row it touches with a content hash taken at submit
// time, so apply can refuse a proposal whose base has moved on. Status moves
// only along lib/proposals/proposalStatus.ts.
export const changeProposalStatusValidator = v.union(
  v.literal("submitted"),
  v.literal("changes_requested"),
  v.literal("applied"),
  v.literal("rejected"),
  v.literal("superseded"),
  v.literal("reverted"),
);

export const changeProposalTargetKindValidator = v.union(
  v.literal("article"),
  v.literal("indexLayout"),
  v.literal("about"),
  v.literal("copyBlock"),
);

export const changeProposalTargetValidator = v.object({
  kind: changeProposalTargetKindValidator,
  key: v.string(),
  baseHash: v.string(),
});

const changeProposal = v.object({
  proposedBy: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  status: changeProposalStatusValidator,
  targets: v.array(changeProposalTargetValidator),
  payload: v.any(),
  summary: v.string(),
  diff: v.string(),
  /** Present only when submit generated this diff from a verified server baseline. */
  diffVersion: v.optional(v.literal(1)),
  revisionOf: v.optional(v.id("changeProposals")),
  reviewedBy: v.optional(v.string()),
  reviewedAt: v.optional(v.string()),
  reviewNotes: v.optional(v.string()),
  comments: v.array(v.object({ by: v.string(), at: v.string(), text: v.string() })),
  appliedAt: v.optional(v.string()),
  appliedChangelogEntryId: v.optional(v.string()),
  /** Per-target `readProposalTarget` documents captured right before apply; what revert writes back. */
  snapshotBefore: v.optional(v.any()),
  /** Per-target live hashes right after apply; revert refuses when production has moved past them. */
  appliedHashes: v.optional(
    v.array(v.object({ kind: changeProposalTargetKindValidator, key: v.string(), hash: v.string() })),
  ),
  revertedAt: v.optional(v.string()),
  conflictReason: v.optional(v.string()),
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
  avatarR2Key: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  // Immutable-current avatar identity used by the reviewed identity/social
  // projection's exact expected-before CAS. Optional for legacy profiles.
  avatarSha256: v.optional(v.string()),
  avatarProvenance: v.optional(v.string()),
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
  // Partial curation of the contributor's replication grid. Listed replication
  // slugs render first, in exactly this order; everything else the contributor
  // owns follows in the existing default sort. Slugs that no longer resolve to
  // a `replications` row are pruned on write and ignored on read, so a deleted
  // replication cannot leave a hole in the ordering.
  replicationOrder: v.optional(v.array(v.string())),
  // Same partial-curation contract for the contributor's trip reports, against
  // `tripReports` slugs.
  reportOrder: v.optional(v.array(v.string())),
  // The contributor's opt-out from the public /replications gallery. Absent
  // means included; `false` is never stored (the write clears the field
  // instead). This gates only the gallery corpus read — effect-article
  // sections, substance showcases, profile pages, and permalinks still show
  // the works.
  exclude_from_gallery: v.optional(v.boolean()),
  // Staff-maintained memorial/showcase marker. Absent means a normal profile;
  // `false` is never stored (the write clears the field instead). Renders the
  // "Archival profile" notice on the public page. Admin-only write path
  // (`saveProfileAsEditor`); the self-serve save cannot touch it.
  archival: v.optional(v.boolean()),
  // Editorial endorsement of a replication artist. Absent means an ordinary
  // artist; `false` is never stored (the write clears the field instead).
  // Stars the artist's name on the /replications index and lifts their rail
  // above the rest of the default artist order. Distinct from
  // `contributorReplicatorVerifications`, which records whether a profile
  // really is the replicator; this records that dose.wiki vouches for the
  // work. Admin-only write path, like `archival`.
  approved_replicator: v.optional(v.boolean()),
  // Signed staff commentary ("Editor's note") rendered under the public bio.
  // Absent renders nothing. Admin-only write path, like `archival`.
  staffNote: v.optional(
    v.object({
      markdown: v.string(),
      attribution: v.optional(v.string()),
    }),
  ),
  createdAt: v.string(),
  updatedAt: v.string(),
  updatedBy: v.optional(v.string()),
  // A losslessly merged source profile remains stored under its immutable ID.
  // Public reads collapse it into this canonical target; rollback clears these
  // fields and restores every retargeted association from the merge journal.
  mergedIntoProfileId: v.optional(v.id("contributorProfiles")),
  mergedIntoKey: v.optional(v.string()),
  mergedByOperationId: v.optional(v.string()),
  mergedAt: v.optional(v.number()),
});

// Lossless Effect Index source records retained for a future EI-specific
// deployment. This table is intentionally not part of any DoseWiki read path.
const effectIndexArchiveRecord = v.object({
  kind: v.string(),
  key: v.string(),
  payload: v.any(),
  importedAt: v.number(),
});

// Substance-article safety banner presets. One document per preset; the shared
// pure rules live in `src/data/substanceWarningBanners.ts` and are imported by
// both `server/warningBanners.ts` and the /dev Banner Studio.
//
// Render scope is editorially explicit: `enabled` plus either `allSubstances`
// or an `enabledSlugs` entry. Nothing is derived from free-text classification
// strings. `allSubstances` is optional only so rows written before sitewide
// scope was introduced remain readable; every new write stores it.
//
// Four columns were dropped and must not come back. `label` was a third name
// for a banner beside `key` and `headline`, and three names for one thing was
// the single largest source of confusion in the Studio; `key` is now both the
// identity and the editor-facing name. `priority` was a numeric tiebreak nobody
// could reason about under a two-banner cap, so ordering is tone then key.
// `links` is a removed feature. `candidateMatchers` was a search input
// persisted as state: `searchWarningBannerTargets` matches substance names and
// class strings live, so the stored copy only went stale.
//
// Every string a reader sees is stored here, so rewording a banner is an edit
// rather than a deploy.
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
  }).index("by_key", ["key"]).index("by_due", ["pending", "nextAttemptAt"]),
  // Main substance index table - each document is a complete SubstanceArticle
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

  // Point-in-time ProtestKit snapshot keyed by canonical DoseWiki slug.
  reagentTests: defineTable(reagentTestDocumentValidator)
    .index("by_slug", ["slug"])
    .index("by_snapshot_hash", ["snapshotHash"]),

  // Changelog table - tracks all article changes
  changelog: defineTable(changelogEntry)
    .index("by_entry_id", ["entryId"])
    .index("by_created_at", ["createdAt"])
    .index("by_submitted_by", ["submittedBy"]),

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
    .index("by_owner_email", ["owner_email"])
    .index("by_featured", ["featured"])
    .index("by_subject_profile_key", ["subject.profile_key"]),

  // Denormalized (report, lowercase substance name) pairs so article renders
  // can find a substance's reports through an index instead of a table scan.
  // Maintained by server/lib/tripReportSubstanceIndex.ts; backfilled by
  // tripReports:backfillSubstanceIndex.
  tripReportSubstances: defineTable({
    report_id: v.id("tripReports"),
    name_lower: v.string(),
  })
    .index("by_name_lower", ["name_lower"])
    .index("by_report", ["report_id"]),

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

  // Private site-wide general feedback intake. Editor-only; never rendered publicly.
  siteFeedback: defineTable(siteFeedback)
    .index("by_status_created", ["status", "created_at"])
    .index("by_created_at", ["created_at"])
    .index("by_public_id", ["id"]),

  // Private mailing-list signup intake shared by the four public sites
  // (josiekins.xyz, dose.wiki, effectindex.com, mindstate.design). Rows are
  // written only through the public /subscribe HTTP endpoint; editor-only reads.
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

  // Subjective effect articles - imported from EffectIndex
  subjectiveEffects: defineTable(subjectiveEffect)
    .index("by_slug", ["slug"])
    .index("by_featured", ["featured"]),

  // EffectIndex articles - intensity scales, substance analyses, methodology
  effectIndexArticles: defineTable(effectIndexArticle)
    .index("by_slug", ["slug"])
    // Writing tab listings: one kind, one status, newest publication date first.
    // Legacy rows carry neither `kind` nor `status`, so they sort under the
    // undefined prefix rather than under "article"/"published".
    .index("by_kind_status_date", ["kind", "status", "publicationDate"])
    .index("by_featured", ["featured"]),

  // Raw Effect Index people, profiles, and posts. Never render from this table.
  effectIndexArchive: defineTable(effectIndexArchiveRecord)
    .index("by_kind_key", ["kind", "key"]),

  // Video and image replications of effects
  replications: defineTable(replication)
    .index("by_effect", ["effect_slug"])
    .index("by_slug", ["slug"])
    .index("by_artist", ["artist"])
    .index("by_source_sha256", ["source_sha256"])
    .index("by_source_catalog_id", ["source_catalog_id"])
    .index("by_taxonomy_record_key", ["taxonomy_record_key"])
    .index("by_replication_status", ["replication_status"]),

  // Full Reddit post/submitter provenance stays out of hot gallery documents.
  // One record may retain several posts and posters for the same media payload.
  replicationSourceAttribution: defineTable(replicationSourceAttribution)
    .index("by_replication_id", ["replication_id"])
    .index("by_source_catalog_id", ["source_catalog_id"])
    .index("by_source_sha256", ["source_sha256"]),

  // Additive identity/social projection. These records stay separate from the
  // hot gallery row so legacy replications remain valid and cheap to paginate.
  replicationIdentityAttributions: defineTable(replicationIdentityAttributionValidator)
    .index("by_replication_id", ["replication_id"])
    .index("by_poster_profile_id", ["poster_profile_id"])
    .index("by_creator_profile_id", ["creator_profile_id"]),

  contributorAliasEvidence: defineTable(contributorAliasEvidenceValidator)
    .index("by_profile_id", ["profile_id"])
    .index("by_profile_id_and_normalized_alias", ["profile_id", "normalized_alias"])
    .index("by_normalized_alias", ["normalized_alias"]),

  // Precomputed complete identity snapshots let alias CAS remain exact without
  // scanning thousands of contributor profiles inside one mutation.
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

  // Reversible, evidence-bound consolidation records for same-work duplicates.
  // Media and source rows remain intact; only one replication stays public.
  replicationDuplicateReconciliations: defineTable(replicationDuplicateReconciliation)
    .index("by_component_id", ["component_id"])
    .index("by_keeper_replication_id", ["keeper_replication_id"])
    .index("by_suppressed_replication_id", ["suppressed_replication_id"]),

  // One full dating/provenance dossier per replication. The compact date_info
  // summary lives on `replications`; this table keeps the evidence out of hot
  // gallery reads while remaining available for later editorial/public UI.
  replicationDateResearch: defineTable(replicationDateResearch)
    .index("by_replication_id", ["replication_id"]),

  // Full editorial rationales stay out of the hot gallery documents. Evidence
  // is retained per campaign digest so a later classification does not erase
  // the review trail that preceded it.
  replicationTaxonomyEvidence: defineTable(replicationTaxonomyEvidence)
    .index("by_replication_id", ["replication_id"])
    .index("by_replication_digest", ["replication_id", "taxonomy_source_digest"])
    .index("by_source_catalog_id", ["source_catalog_id"])
    .index("by_taxonomy_record_key", ["taxonomy_record_key"]),

  // Artist Pages derive from credited artist labels rather than Contributor
  // Profile ownership. This table therefore keys the classification to the
  // normalized Artist Page identity and remains valid for unclaimed artists.
  replicationArtistTaxonomy: defineTable(replicationArtistTaxonomy)
    .index("by_key", ["key"]),

  // Per-substance Replication Showcase curation; see the validator's note.
  substanceGalleries: defineTable(substanceGallery)
    .index("by_substance", ["substance_slug"]),

  // Reusable named replication playlists, applied into a gallery's draft; see
  // the validator's note. Nothing here publishes on its own.
  replicationPlaylists: defineTable(replicationPlaylist)
    .index("by_key", ["key"])
    .index("by_owner_email", ["owner_email"]),

  // Append-only journal of what a profile, playlist, or trip report looked
  // like before each write. A member editing or deleting their own things
  // never destroys the prior version; it moves here. Read by admins only.
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

  // Category layout - stores the manually curated psychoactive index structure
  // as a single document containing the full layout configuration.
  // The public /substances page still reads this table; indexLayouts.save and
  // bulkImport mirror psychoactive layouts into it (server/lib/categoryLayoutMirror.ts).
  // Durable fix: point public reads at the indexLayouts table, then retire this mirror.
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

  // Site configuration - About page content and other global settings.
  // One document per well-known `key`; every payload field is optional because
  // a document only carries the fields its own key means.
  //
  //   "about"                              → aboutMarkdown / aboutSubtitle / founderProfileKeys
  //   "effect-index-featured-replications" → featuredReplicationSlugs
  //   "safety-banner-display"              → bannerIconSize
  //
  // The featured list lives here rather than as a `featured` column on
  // `replications` because it is an *ordered* editorial selection, not a
  // property of a row: the Effect Index carousel shows these slugs in this
  // order, and a per-row boolean cannot express the order. It also keeps the
  // homepage's read to one small document instead of a whole-table scan.
  siteConfig: defineTable({
    key: v.string(),
    aboutMarkdown: v.optional(v.string()),
    aboutSubtitle: v.optional(v.string()),
    founderProfileKeys: v.optional(v.array(v.string())),
    featuredReplicationSlugs: v.optional(v.array(v.string())),
    bannerIconSize: v.optional(v.number()),
    updatedAt: v.string(),
    updatedBy: v.optional(v.string()),
  }).index("by_key", ["key"]),

  // Editable site copy. One document per copy block: the prose that public
  // pages used to hardcode, lifted into Postgres so the /dev Copy Studio can edit
  // it without a deploy. `key` is the stable lookup id used by the server read
  // helper; `flavor` scopes a block to one site skin (e.g. "effect-index") and
  // is absent for blocks shared by every flavor.
  //
  // `kind` picks which payload field is authoritative:
  //   "markdown" | "plain" → `body`
  //   "list"               → `items`
  // `label` and `group` are editor-facing only; they drive the Copy Studio rail
  // and never reach a reader.
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

  // Substance-article safety banner presets; see the validator's note. Scope is
  // explicit: a slug list or the deliberate `allSubstances` switch.
  warningBannerPresets: defineTable(warningBannerPreset).index("by_key", ["key"]),

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
  // Replaces the bundled JSON files in data/substances/
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
});
