CREATE TABLE "articleDraftReceipts" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"ownerEmail" text NOT NULL,
	"changeId" text NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articleDrafts" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"slug" text NOT NULL,
	"ownerEmail" text NOT NULL,
	"article" jsonb,
	"baseHash" text NOT NULL,
	"version" double precision NOT NULL,
	"updatedAt" text NOT NULL,
	"revisionOf" text
);
--> statement-breakpoint
CREATE TABLE "articleFeedback" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"id" text NOT NULL,
	"status" text NOT NULL,
	"schema_version" double precision NOT NULL,
	"substance_slug" text NOT NULL,
	"substance_title" text NOT NULL,
	"category" text NOT NULL,
	"importance" text NOT NULL,
	"details" text NOT NULL,
	"source_url" text,
	"contact_email" text,
	"ip_hash" text,
	"user_agent" text,
	"honeypot_triggered" boolean NOT NULL,
	"review_notes" text,
	"reviewed_by" text,
	"reviewed_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articleHistory" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"slug" text NOT NULL,
	"changelog_id" text NOT NULL,
	"createdAt" text NOT NULL,
	"source_created" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articleProposalTargets" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"slug" text NOT NULL,
	"ownerEmail" text NOT NULL,
	"proposalId" text NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articleRevisions" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"slug" text NOT NULL,
	"changeId" text NOT NULL,
	"actorEmail" text NOT NULL,
	"actorRole" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"baseHash" text NOT NULL,
	"resultHash" text NOT NULL,
	"summary" text NOT NULL,
	"createdAt" text NOT NULL,
	"restoredFrom" text
);
--> statement-breakpoint
CREATE TABLE "articleSources" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"slug" text NOT NULL,
	"substanceName" text NOT NULL,
	"sources" jsonb NOT NULL,
	"contents" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categoryLayout" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"version" double precision NOT NULL,
	"categories" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "changeProposals" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"proposedBy" text NOT NULL,
	"createdAt" text NOT NULL,
	"updatedAt" text NOT NULL,
	"status" text NOT NULL,
	"targets" jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"summary" text NOT NULL,
	"diff" text NOT NULL,
	"diffVersion" double precision,
	"revisionOf" text,
	"reviewedBy" text,
	"reviewedAt" text,
	"reviewNotes" text,
	"comments" jsonb NOT NULL,
	"appliedAt" text,
	"appliedChangelogEntryId" text,
	"snapshotBefore" jsonb,
	"appliedHashes" jsonb,
	"revertedAt" text,
	"conflictReason" text
);
--> statement-breakpoint
CREATE TABLE "changelog" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"entryId" text NOT NULL,
	"createdAt" text NOT NULL,
	"message" text NOT NULL,
	"markdown" text NOT NULL,
	"submittedBy" text,
	"articles" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citationEvidence" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"slug" text NOT NULL,
	"articleId" jsonb,
	"section" text NOT NULL,
	"claimKey" text NOT NULL,
	"claimText" text,
	"fieldPath" text,
	"entailmentVerdict" text,
	"strictReviewEvidence" jsonb,
	"referenceIds" jsonb NOT NULL,
	"sourceName" text,
	"sourceType" text,
	"quality" text,
	"status" text NOT NULL,
	"statusReason" text,
	"severity" text NOT NULL,
	"confidence" double precision,
	"supportingSnippet" text,
	"supportRationale" text,
	"supports" jsonb,
	"diagnostics" jsonb,
	"provenance" jsonb,
	"createdAt" text NOT NULL,
	"updatedAt" text NOT NULL,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE "contentRevisions" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"table" text NOT NULL,
	"key" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb NOT NULL,
	"actorEmail" text NOT NULL,
	"actorRole" text NOT NULL,
	"createdAt" text NOT NULL,
	"after" jsonb,
	"operationId" text,
	"revision" text,
	"publications" jsonb,
	"requestIdentity" text,
	"clientRequestIdentity" text,
	"requestHash" text
);
--> statement-breakpoint
CREATE TABLE "contributorAliasEvidence" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"profile_id" text NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"platform" text,
	"first_seen_at" double precision,
	"last_seen_at" double precision,
	"evidence" jsonb NOT NULL,
	"operation_id" text NOT NULL,
	"recorded_at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributorAvatarHistory" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"profile_id" text NOT NULL,
	"provenance" text NOT NULL,
	"storage_id" text,
	"r2_key" text,
	"public_url" text,
	"source_url" text,
	"media_digest" text NOT NULL,
	"delivery_verification" text NOT NULL,
	"delivery_verified_at" double precision,
	"delivery_receipt" jsonb,
	"evidence" jsonb NOT NULL,
	"operation_id" text NOT NULL,
	"recorded_at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributorIdentitySnapshotMaterializations" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"snapshot_digest" text NOT NULL,
	"profile_count" double precision NOT NULL,
	"profile_ids_digest" text NOT NULL,
	"token_count" double precision NOT NULL,
	"operation_id" text NOT NULL,
	"created_at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributorIdentityTokenSnapshots" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"snapshot_digest" text NOT NULL,
	"profile_count" double precision NOT NULL,
	"normalized_token" text NOT NULL,
	"owner_count" double precision NOT NULL,
	"owner_profile_ids" jsonb NOT NULL,
	"materialization_operation_id" text,
	"created_at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributorProfileMergeItems" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"operation_id" text NOT NULL,
	"ordinal" double precision NOT NULL,
	"table" text NOT NULL,
	"row_id" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"created_at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributorProfileMergeOperations" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"operation_id" text NOT NULL,
	"payload_digest" text NOT NULL,
	"source_profile_id" text NOT NULL,
	"source_key" text NOT NULL,
	"target_profile_id" text NOT NULL,
	"target_key" text NOT NULL,
	"pinned_snapshot_digest" text NOT NULL,
	"pinned_snapshot_profile_count" double precision NOT NULL,
	"expected_state_digest" text NOT NULL,
	"applied_state_digest" text NOT NULL,
	"actor_email" text NOT NULL,
	"item_count" double precision NOT NULL,
	"status" text NOT NULL,
	"rollback_operation_id" text,
	"created_at" double precision NOT NULL,
	"rolled_back_at" double precision
);
--> statement-breakpoint
CREATE TABLE "contributorProfiles" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"key" text NOT NULL,
	"displayName" text NOT NULL,
	"aliases" jsonb NOT NULL,
	"avatarStorageId" text,
	"avatarR2Key" text,
	"avatarUrl" text,
	"avatarSha256" text,
	"avatarProvenance" text,
	"bio" text NOT NULL,
	"role" text,
	"links" jsonb NOT NULL,
	"membershipEmail" text,
	"replicationOrder" jsonb,
	"reportOrder" jsonb,
	"exclude_from_gallery" boolean,
	"archival" boolean,
	"approved_replicator" boolean,
	"staffNote" jsonb,
	"createdAt" text NOT NULL,
	"updatedAt" text NOT NULL,
	"updatedBy" text,
	"mergedIntoProfileId" text,
	"mergedIntoKey" text,
	"mergedByOperationId" text,
	"mergedAt" double precision
);
--> statement-breakpoint
CREATE TABLE "contributorReplicatorVerifications" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"profile_id" text NOT NULL,
	"status" text NOT NULL,
	"basis" text NOT NULL,
	"work_count_reviewed" double precision NOT NULL,
	"rationale" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"source_digest" text NOT NULL,
	"operation_id" text NOT NULL,
	"reviewed_at" double precision NOT NULL,
	"review_contributions" jsonb
);
--> statement-breakpoint
CREATE TABLE "copyBlocks" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"key" text NOT NULL,
	"flavor" text,
	"kind" text NOT NULL,
	"body" text,
	"items" jsonb,
	"label" text NOT NULL,
	"group" text NOT NULL,
	"updatedAt" text NOT NULL,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE "effectIndexArchive" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"importedAt" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "effectIndexArticles" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"tags" jsonb NOT NULL,
	"publication_status" text,
	"featured" boolean,
	"shortDescription" text,
	"publicationDate" text,
	"body_raw" text NOT NULL,
	"body_ast" jsonb,
	"authors" jsonb,
	"citations" jsonb,
	"kind" text,
	"status" text,
	"bodyFormat" text,
	"authorProfileKeys" jsonb,
	"coverImageUrl" text,
	"teaser" text
);
--> statement-breakpoint
CREATE TABLE "generatedPublicationOperations" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"proposalId" text NOT NULL,
	"payloadDigest" text NOT NULL,
	"artifactDigest" text NOT NULL,
	"manifestDigest" text NOT NULL,
	"rawResponseHash" text NOT NULL,
	"targetDeploymentFingerprint" text NOT NULL,
	"slug" text NOT NULL,
	"profile" text NOT NULL,
	"affectedPaths" jsonb NOT NULL,
	"actorEmail" text NOT NULL,
	"reviewedBy" text NOT NULL,
	"reviewedAt" text NOT NULL,
	"previousHash" text NOT NULL,
	"nextHash" text NOT NULL,
	"hashVersion" text NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexLayouts" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"type" text NOT NULL,
	"version" double precision NOT NULL,
	"categories" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inviteCodes" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"codeHash" text NOT NULL,
	"role" text NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" text NOT NULL,
	"expiresAt" text NOT NULL,
	"maxUses" double precision NOT NULL,
	"redemptions" jsonb NOT NULL,
	"revokedAt" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "mailingListSubscribers" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"email" text NOT NULL,
	"list" text NOT NULL,
	"status" text NOT NULL,
	"created_at" double precision NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"honeypot_triggered" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"email" text NOT NULL,
	"username" text,
	"passwordHash" text,
	"passwordUpdatedAt" text,
	"resetTokenHash" text,
	"resetTokenExpiresAt" text,
	"invitedBy" text,
	"inviteCodeId" text,
	"bannedAt" text,
	"name" text,
	"image" text,
	"role" text NOT NULL,
	"provider" text,
	"providerAccountId" text,
	"createdAt" text NOT NULL,
	"updatedAt" text NOT NULL,
	"lastSeenAt" text
);
--> statement-breakpoint
CREATE TABLE "moleculeClassTemplates" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"classKey" text NOT NULL,
	"molblock" text NOT NULL,
	"boldBonds" jsonb,
	"updatedAt" double precision NOT NULL,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE "moleculeOverrides" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"slug" text NOT NULL,
	"svg" text NOT NULL,
	"molblock" text NOT NULL,
	"smiles" text,
	"boldBonds" jsonb,
	"source" text,
	"updatedAt" text NOT NULL,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE "narrativeRevisions" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"documentId" text NOT NULL,
	"operationId" text NOT NULL,
	"actorEmail" text NOT NULL,
	"actorRole" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"baseRevision" text NOT NULL,
	"revision" text NOT NULL,
	"createdAt" text NOT NULL,
	"requestHash" text,
	"publications" jsonb
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"key" text NOT NULL,
	"content" text NOT NULL,
	"updatedAt" text NOT NULL,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE "publicCachePublications" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"key" text NOT NULL,
	"target" jsonb NOT NULL,
	"revision" jsonb,
	"generation" double precision NOT NULL,
	"pending" boolean NOT NULL,
	"committedAt" double precision NOT NULL,
	"nextAttemptAt" double precision NOT NULL,
	"attempts" double precision NOT NULL,
	"receipts" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publicReadIndexState" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"name" text NOT NULL,
	"version" double precision NOT NULL,
	"cursor" text,
	"ready" boolean NOT NULL,
	"processed" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"slug" text NOT NULL,
	"section" text NOT NULL,
	"content" text NOT NULL,
	"updatedAt" text NOT NULL,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE "reagentTests" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"slug" text NOT NULL,
	"data" jsonb NOT NULL,
	"source" text NOT NULL,
	"snapshotHash" text NOT NULL,
	"importedAt" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replicationArtistTaxonomy" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"primary_type" text NOT NULL,
	"artist_type_tags" jsonb NOT NULL,
	"confidence" text NOT NULL,
	"rationale" text NOT NULL,
	"review_required" boolean NOT NULL,
	"classification_review_count" double precision NOT NULL,
	"classification_review_agreement" boolean,
	"replication_count" double precision NOT NULL,
	"taxonomy_version" double precision NOT NULL,
	"taxonomy_source_digest" text NOT NULL,
	"operation_id" text NOT NULL,
	"imported_at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replicationDateResearch" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"replication_id" text NOT NULL,
	"replication_slug" text NOT NULL,
	"replication_title" text NOT NULL,
	"replication_artist" text NOT NULL,
	"date_info" jsonb NOT NULL,
	"rationale" text NOT NULL,
	"source_urls" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"methods" jsonb,
	"rejected_dates" jsonb,
	"alternative_dates" jsonb,
	"source_artifact" text NOT NULL,
	"source_artifact_sha256" text NOT NULL,
	"source_record_sha256" text NOT NULL,
	"schema_version" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replicationDuplicateReconciliations" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"component_id" text NOT NULL,
	"keeper_replication_id" text NOT NULL,
	"suppressed_replication_id" text NOT NULL,
	"evidence_digest" text NOT NULL,
	"classification" text NOT NULL,
	"keeper_policy" text NOT NULL,
	"reddit_post_ids" jsonb NOT NULL,
	"source_references" jsonb NOT NULL,
	"state" text NOT NULL,
	"operation_id" text NOT NULL,
	"rollback_operation_id" text,
	"created_at" double precision NOT NULL,
	"updated_at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replicationEditReceipts" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"requestId" text NOT NULL,
	"actorEmail" text NOT NULL,
	"actorRole" text NOT NULL,
	"operation" text NOT NULL,
	"expectedRevision" text NOT NULL,
	"publications" jsonb NOT NULL,
	"target" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replicationGalleryCandidates" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"candidate_key" text NOT NULL,
	"replication_id" text NOT NULL,
	"source_created" double precision NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"role" text,
	"effect_slug" text,
	"title_drugs" jsonb,
	"title_class_mentions" jsonb,
	"showcase_excluded" boolean,
	"replication_status" text,
	"publication_state" text
);
--> statement-breakpoint
CREATE TABLE "replicationIdentityAttributions" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"replication_id" text NOT NULL,
	"poster_display_name" text NOT NULL,
	"poster_profile_id" text,
	"poster_profile_url" text,
	"poster_platform" text,
	"poster_posted_at" double precision,
	"creator_display_name" text NOT NULL,
	"creator_profile_id" text,
	"creator_determination" text NOT NULL,
	"review_status" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"source_digest" text NOT NULL,
	"operation_id" text NOT NULL,
	"updated_at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replicationIdentityProfileBindings" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"artist_id" text NOT NULL,
	"profile_id" text NOT NULL,
	"profile_key" text NOT NULL,
	"decision" text NOT NULL,
	"snapshot_digest" text NOT NULL,
	"operation_id" text NOT NULL,
	"bound_at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replicationIdentitySocialOperationItems" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"item_operation_id" text NOT NULL,
	"batch_operation_id" text NOT NULL,
	"kind" text NOT NULL,
	"target" jsonb NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"changed" boolean NOT NULL,
	"created_at" double precision NOT NULL,
	"profile_before" jsonb,
	"profile_after" jsonb,
	"created_profile_id" text,
	"created_profile_snapshot" jsonb,
	"verification_before" jsonb,
	"verification_after" jsonb,
	"satisfied_item_operation_ids" jsonb
);
--> statement-breakpoint
CREATE TABLE "replicationIdentitySocialOperations" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"operation_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload_digest" text NOT NULL,
	"actor_email" text NOT NULL,
	"record_count" double precision NOT NULL,
	"changed_count" double precision NOT NULL,
	"unchanged_count" double precision NOT NULL,
	"rollback_of" text,
	"created_at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replicationPlaylists" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"key" text NOT NULL,
	"owner_email" text,
	"title" text NOT NULL,
	"replication_slugs" jsonb NOT NULL,
	"updated_at" text NOT NULL,
	"updated_by" text,
	"archived_at" text,
	"archived_by" text
);
--> statement-breakpoint
CREATE TABLE "replicationSocialAssets" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"entity_kind" text NOT NULL,
	"entity_key" text NOT NULL,
	"replication_id" text,
	"variant" text NOT NULL,
	"storage_id" text,
	"r2_key" text,
	"public_url" text,
	"width" double precision NOT NULL,
	"height" double precision NOT NULL,
	"mime_type" text NOT NULL,
	"media_digest" text NOT NULL,
	"source_digest" text NOT NULL,
	"status" text NOT NULL,
	"delivery_verification" text NOT NULL,
	"delivery_verified_at" double precision,
	"delivery_receipt" jsonb,
	"failure_reason" text,
	"operation_id" text NOT NULL,
	"generated_at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replicationSourceAttribution" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"replication_id" text NOT NULL,
	"source_catalog_id" text NOT NULL,
	"source_sha256" text NOT NULL,
	"reddit_post_ids" jsonb NOT NULL,
	"poster" jsonb NOT NULL,
	"source_references" jsonb NOT NULL,
	"disposition" text NOT NULL,
	"proposed_artist" text NOT NULL,
	"reviewed_creator_override" jsonb,
	"review_required" boolean NOT NULL,
	"source_digest" text NOT NULL,
	"operation_id" text NOT NULL,
	"updated_at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replicationTaxonomyEvidence" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"replication_id" text NOT NULL,
	"source_catalog_id" text,
	"taxonomy_record_key" text,
	"replication_status" text NOT NULL,
	"replication_status_confidence" text NOT NULL,
	"replication_status_rationale" text NOT NULL,
	"viewing_mode" text,
	"viewing_mode_confidence" text,
	"viewing_mode_rationale" text,
	"content_family" text,
	"content_tags" jsonb,
	"content_family_confidence" text,
	"content_family_rationale" text,
	"review_required" boolean NOT NULL,
	"taxonomy_version" double precision NOT NULL,
	"taxonomy_source_digest" text NOT NULL,
	"operation_id" text NOT NULL,
	"imported_at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replications" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"artist_url" text,
	"role" text,
	"publication_state" text,
	"duplicate_of_replication_id" text,
	"duplicate_evidence_digest" text,
	"duplicate_operation_id" text,
	"duplicate_suppressed_at" double precision,
	"type" text NOT NULL,
	"storage_id" text,
	"effect_slug" text,
	"showcase_excluded" boolean,
	"thumbnail_storage_id" text,
	"preview_storage_id" text,
	"motion_storage_id" text,
	"motion_poster_storage_id" text,
	"r2_key" text,
	"thumbnail_r2_key" text,
	"preview_r2_key" text,
	"motion_r2_key" text,
	"motion_poster_r2_key" text,
	"url" text,
	"thumbnail_url" text,
	"width" double precision,
	"height" double precision,
	"format" text NOT NULL,
	"file_size" double precision,
	"duration" double precision,
	"has_audio" boolean,
	"created_at" text NOT NULL,
	"date_info" jsonb,
	"effect_tags" jsonb,
	"source_sha256" text,
	"source_catalog_id" text,
	"taxonomy_record_key" text,
	"replication_status" text,
	"replication_status_confidence" text,
	"replication_status_review_required" boolean,
	"viewing_mode" text,
	"viewing_mode_tags" jsonb,
	"viewing_mode_confidence" text,
	"viewing_mode_review_required" boolean,
	"title_drugs" jsonb,
	"title_class_mentions" jsonb,
	"drug_classes" jsonb,
	"content_family" text,
	"content_tags" jsonb,
	"content_family_confidence" text,
	"content_family_review_required" boolean,
	"taxonomy_review_required" boolean,
	"taxonomy_version" double precision,
	"taxonomy_source_digest" text,
	"taxonomy_updated_at" double precision,
	"rights_status" text,
	"license_name" text,
	"license_url" text,
	"credit_line" text,
	"source_url" text,
	"rightsholder" text,
	"permission_notes" text,
	"removal_contact" text
);
--> statement-breakpoint
CREATE TABLE "reviewedArticles" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"article_id" text NOT NULL,
	"source_created" double precision NOT NULL,
	"reviewer_email" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"reviewed_at" text
);
--> statement-breakpoint
CREATE TABLE "siteConfig" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"key" text NOT NULL,
	"aboutMarkdown" text,
	"aboutSubtitle" text,
	"founderProfileKeys" jsonb,
	"featuredReplicationSlugs" jsonb,
	"bannerIconSize" double precision,
	"updatedAt" text NOT NULL,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE "siteFeedback" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"id" text NOT NULL,
	"status" text NOT NULL,
	"schema_version" double precision NOT NULL,
	"category" text NOT NULL,
	"urgency" text,
	"details" text NOT NULL,
	"page" text,
	"email" text,
	"ip_hash" text,
	"user_agent" text,
	"honeypot_triggered" boolean NOT NULL,
	"review_notes" text,
	"reviewed_by" text,
	"reviewed_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjectiveEffects" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tags" jsonb NOT NULL,
	"featured" boolean,
	"summary" text NOT NULL,
	"description_raw" text NOT NULL,
	"description_ast" jsonb,
	"long_summary_raw" text,
	"long_summary_ast" jsonb,
	"analysis_raw" text,
	"analysis_ast" jsonb,
	"style_variations_raw" text,
	"style_variations_ast" jsonb,
	"personal_commentary_raw" text,
	"personal_commentary_ast" jsonb,
	"social_media_image" text,
	"gallery_order" jsonb,
	"audio_replications" jsonb,
	"see_also" jsonb,
	"external_links" jsonb,
	"citations" jsonb,
	"subarticles" jsonb,
	"contributors" jsonb
);
--> statement-breakpoint
CREATE TABLE "substanceGalleries" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"substance_slug" text NOT NULL,
	"curated_slugs" jsonb NOT NULL,
	"removed_slugs" jsonb NOT NULL,
	"carousel_order" jsonb,
	"disabled" boolean,
	"updated_at" text NOT NULL,
	"updated_by" text,
	"archived_at" text,
	"archived_by" text
);
--> statement-breakpoint
CREATE TABLE "substanceIndex" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"id" double precision,
	"title" text NOT NULL,
	"slug" text,
	"priority" jsonb,
	"index_categories" jsonb NOT NULL,
	"identification" jsonb NOT NULL,
	"classification" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"dosage" jsonb NOT NULL,
	"duration" jsonb NOT NULL,
	"subjective_effects" jsonb NOT NULL,
	"comparisons" jsonb NOT NULL,
	"pharmacology" jsonb NOT NULL,
	"interactions" jsonb NOT NULL,
	"reagent_testing" jsonb NOT NULL,
	"tolerance" jsonb NOT NULL,
	"harm_potential" jsonb NOT NULL,
	"history_culture" jsonb,
	"legality" jsonb NOT NULL,
	"editorial_review" jsonb,
	"section_gaps" jsonb,
	"references" jsonb,
	"source_citations" jsonb,
	"citations" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tripReportSubmissions" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"id" text NOT NULL,
	"status" text NOT NULL,
	"schema_version" double precision NOT NULL,
	"report" jsonb NOT NULL,
	"title" text NOT NULL,
	"author_name" text NOT NULL,
	"substance_names" jsonb NOT NULL,
	"contact_email" text,
	"may_contact" boolean NOT NULL,
	"publish_consent" boolean NOT NULL,
	"age_confirmed" boolean NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"honeypot_triggered" boolean NOT NULL,
	"review_notes" text,
	"reviewed_by" text,
	"reviewed_at" text,
	"exported_trip_report_id" text,
	"exported_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tripReportSubstances" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"report_id" text NOT NULL,
	"name_lower" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tripReports" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"featured" boolean,
	"owner_email" text,
	"subject" jsonb NOT NULL,
	"substances" jsonb NOT NULL,
	"introduction" text,
	"onset" jsonb NOT NULL,
	"peak" jsonb NOT NULL,
	"offset" jsonb NOT NULL,
	"conclusion" text,
	"tags" jsonb NOT NULL,
	"license" text,
	"attribution_review" jsonb
);
--> statement-breakpoint
CREATE TABLE "warningBannerPresets" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"key" text NOT NULL,
	"tone" text NOT NULL,
	"icon" text NOT NULL,
	"severityLabel" text NOT NULL,
	"headline" text NOT NULL,
	"points" jsonb NOT NULL,
	"enabled" boolean NOT NULL,
	"allSubstances" boolean,
	"enabledSlugs" jsonb NOT NULL,
	"updatedAt" text NOT NULL,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE "warningBannerRevisions" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"key" text NOT NULL,
	"changeId" text NOT NULL,
	"requestHash" text NOT NULL,
	"actorEmail" text NOT NULL,
	"actorRole" text NOT NULL,
	"scope" text NOT NULL,
	"slug" text,
	"operation" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"baseHash" text NOT NULL,
	"resultHash" text NOT NULL,
	"createdAt" text NOT NULL,
	"affectedSlugs" jsonb NOT NULL,
	"allSubstances" boolean NOT NULL,
	"publications" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "articleDraftReceipts_by_creation_time" ON "articleDraftReceipts" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "articleDraftReceipts_by_owner_change" ON "articleDraftReceipts" USING btree ("ownerEmail","changeId","_creationTime");--> statement-breakpoint
CREATE INDEX "articleDrafts_by_creation_time" ON "articleDrafts" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "articleDrafts_by_owner_slug" ON "articleDrafts" USING btree ("ownerEmail","slug","_creationTime");--> statement-breakpoint
CREATE INDEX "articleFeedback_by_creation_time" ON "articleFeedback" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "articleFeedback_by_status_created" ON "articleFeedback" USING btree ("status","created_at","_creationTime");--> statement-breakpoint
CREATE INDEX "articleFeedback_by_created_at" ON "articleFeedback" USING btree ("created_at","_creationTime");--> statement-breakpoint
CREATE INDEX "articleFeedback_by_public_id" ON "articleFeedback" USING btree ("id","_creationTime");--> statement-breakpoint
CREATE INDEX "articleFeedback_by_substance" ON "articleFeedback" USING btree ("substance_slug","created_at","_creationTime");--> statement-breakpoint
CREATE INDEX "articleHistory_by_creation_time" ON "articleHistory" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "articleHistory_by_slug_created" ON "articleHistory" USING btree ("slug","createdAt","source_created","changelog_id","_creationTime");--> statement-breakpoint
CREATE INDEX "articleHistory_by_changelog" ON "articleHistory" USING btree ("changelog_id","_creationTime");--> statement-breakpoint
CREATE INDEX "articleProposalTargets_by_creation_time" ON "articleProposalTargets" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "articleProposalTargets_by_slug_created" ON "articleProposalTargets" USING btree ("slug","createdAt","_creationTime");--> statement-breakpoint
CREATE INDEX "articleProposalTargets_by_owner_slug_created" ON "articleProposalTargets" USING btree ("ownerEmail","slug","createdAt","_creationTime");--> statement-breakpoint
CREATE INDEX "articleProposalTargets_by_proposal_slug" ON "articleProposalTargets" USING btree ("proposalId","slug","_creationTime");--> statement-breakpoint
CREATE INDEX "articleRevisions_by_creation_time" ON "articleRevisions" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "articleRevisions_by_slug" ON "articleRevisions" USING btree ("slug","_creationTime");--> statement-breakpoint
CREATE INDEX "articleRevisions_by_actor_change" ON "articleRevisions" USING btree ("actorEmail","changeId","_creationTime");--> statement-breakpoint
CREATE INDEX "articleSources_by_creation_time" ON "articleSources" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "articleSources_by_slug" ON "articleSources" USING btree ("slug","_creationTime");--> statement-breakpoint
CREATE INDEX "categoryLayout_by_creation_time" ON "categoryLayout" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "changeProposals_by_creation_time" ON "changeProposals" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "changeProposals_by_status" ON "changeProposals" USING btree ("status","_creationTime");--> statement-breakpoint
CREATE INDEX "changeProposals_by_proposed_by" ON "changeProposals" USING btree ("proposedBy","_creationTime");--> statement-breakpoint
CREATE INDEX "changeProposals_by_proposed_by_status" ON "changeProposals" USING btree ("proposedBy","status","_creationTime");--> statement-breakpoint
CREATE INDEX "changeProposals_by_created_at" ON "changeProposals" USING btree ("createdAt","_creationTime");--> statement-breakpoint
CREATE INDEX "changelog_by_creation_time" ON "changelog" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "changelog_by_entry_id" ON "changelog" USING btree ("entryId","_creationTime");--> statement-breakpoint
CREATE INDEX "changelog_by_created_at" ON "changelog" USING btree ("createdAt","_creationTime");--> statement-breakpoint
CREATE INDEX "changelog_by_submitted_by" ON "changelog" USING btree ("submittedBy","_creationTime");--> statement-breakpoint
CREATE INDEX "citationEvidence_by_creation_time" ON "citationEvidence" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "citationEvidence_by_slug" ON "citationEvidence" USING btree ("slug","_creationTime");--> statement-breakpoint
CREATE INDEX "citationEvidence_by_slug_section" ON "citationEvidence" USING btree ("slug","section","_creationTime");--> statement-breakpoint
CREATE INDEX "citationEvidence_by_slug_claim" ON "citationEvidence" USING btree ("slug","claimKey","_creationTime");--> statement-breakpoint
CREATE INDEX "citationEvidence_by_status" ON "citationEvidence" USING btree ("status","_creationTime");--> statement-breakpoint
CREATE INDEX "contentRevisions_by_creation_time" ON "contentRevisions" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "contentRevisions_by_table_key" ON "contentRevisions" USING btree ("table","key","_creationTime");--> statement-breakpoint
CREATE INDEX "contentRevisions_by_operation" ON "contentRevisions" USING btree ("table","key","operationId","_creationTime");--> statement-breakpoint
CREATE INDEX "contentRevisions_by_created_at" ON "contentRevisions" USING btree ("createdAt","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorAliasEvidence_by_creation_time" ON "contributorAliasEvidence" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "contributorAliasEvidence_by_profile_id" ON "contributorAliasEvidence" USING btree ("profile_id","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorAliasEvidence_by_profile_id_and_normalized_alias" ON "contributorAliasEvidence" USING btree ("profile_id","normalized_alias","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorAliasEvidence_by_normalized_alias" ON "contributorAliasEvidence" USING btree ("normalized_alias","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorAvatarHistory_by_creation_time" ON "contributorAvatarHistory" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "contributorAvatarHistory_by_profile_id" ON "contributorAvatarHistory" USING btree ("profile_id","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorAvatarHistory_by_profile_id_and_recorded_at" ON "contributorAvatarHistory" USING btree ("profile_id","recorded_at","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorAvatarHistory_by_profile_id_and_media_digest" ON "contributorAvatarHistory" USING btree ("profile_id","media_digest","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorIdentitySnapshotMaterializations_by_creation_time" ON "contributorIdentitySnapshotMaterializations" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "contributorIdentitySnapshotMaterializations_by_snapshot_digest" ON "contributorIdentitySnapshotMaterializations" USING btree ("snapshot_digest","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorIdentitySnapshotMaterializations_by_operation_id" ON "contributorIdentitySnapshotMaterializations" USING btree ("operation_id","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorIdentityTokenSnapshots_by_creation_time" ON "contributorIdentityTokenSnapshots" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "contributorIdentityTokenSnapshots_by_snapshot_digest_a_32d0efe4" ON "contributorIdentityTokenSnapshots" USING btree ("snapshot_digest","normalized_token","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorProfileMergeItems_by_creation_time" ON "contributorProfileMergeItems" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "contributorProfileMergeItems_by_operation_id_and_ordinal" ON "contributorProfileMergeItems" USING btree ("operation_id","ordinal","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorProfileMergeOperations_by_creation_time" ON "contributorProfileMergeOperations" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "contributorProfileMergeOperations_by_operation_id" ON "contributorProfileMergeOperations" USING btree ("operation_id","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorProfileMergeOperations_by_rollback_operation_id" ON "contributorProfileMergeOperations" USING btree ("rollback_operation_id","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorProfileMergeOperations_by_source_profile_id" ON "contributorProfileMergeOperations" USING btree ("source_profile_id","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorProfileMergeOperations_by_target_profile_id" ON "contributorProfileMergeOperations" USING btree ("target_profile_id","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorProfiles_by_creation_time" ON "contributorProfiles" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "contributorProfiles_by_key" ON "contributorProfiles" USING btree ("key","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorProfiles_by_display_name" ON "contributorProfiles" USING btree ("displayName","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorProfiles_by_membership_email" ON "contributorProfiles" USING btree ("membershipEmail","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorReplicatorVerifications_by_creation_time" ON "contributorReplicatorVerifications" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "contributorReplicatorVerifications_by_profile_id" ON "contributorReplicatorVerifications" USING btree ("profile_id","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorReplicatorVerifications_by_status" ON "contributorReplicatorVerifications" USING btree ("status","_creationTime");--> statement-breakpoint
CREATE INDEX "copyBlocks_by_creation_time" ON "copyBlocks" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "copyBlocks_by_key" ON "copyBlocks" USING btree ("key","_creationTime");--> statement-breakpoint
CREATE INDEX "copyBlocks_by_group" ON "copyBlocks" USING btree ("group","_creationTime");--> statement-breakpoint
CREATE INDEX "effectIndexArchive_by_creation_time" ON "effectIndexArchive" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "effectIndexArchive_by_kind_key" ON "effectIndexArchive" USING btree ("kind","key","_creationTime");--> statement-breakpoint
CREATE INDEX "effectIndexArticles_by_creation_time" ON "effectIndexArticles" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "effectIndexArticles_by_slug" ON "effectIndexArticles" USING btree ("slug","_creationTime");--> statement-breakpoint
CREATE INDEX "effectIndexArticles_by_kind_status_date" ON "effectIndexArticles" USING btree ("kind","status","publicationDate","_creationTime");--> statement-breakpoint
CREATE INDEX "effectIndexArticles_by_featured" ON "effectIndexArticles" USING btree ("featured","_creationTime");--> statement-breakpoint
CREATE INDEX "generatedPublicationOperations_by_creation_time" ON "generatedPublicationOperations" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "generatedPublicationOperations_by_proposal_id" ON "generatedPublicationOperations" USING btree ("proposalId","_creationTime");--> statement-breakpoint
CREATE INDEX "generatedPublicationOperations_by_slug_created" ON "generatedPublicationOperations" USING btree ("slug","createdAt","_creationTime");--> statement-breakpoint
CREATE INDEX "indexLayouts_by_creation_time" ON "indexLayouts" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "indexLayouts_by_type" ON "indexLayouts" USING btree ("type","_creationTime");--> statement-breakpoint
CREATE INDEX "inviteCodes_by_creation_time" ON "inviteCodes" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "inviteCodes_by_code_hash" ON "inviteCodes" USING btree ("codeHash","_creationTime");--> statement-breakpoint
CREATE INDEX "inviteCodes_by_created_at" ON "inviteCodes" USING btree ("createdAt","_creationTime");--> statement-breakpoint
CREATE INDEX "mailingListSubscribers_by_creation_time" ON "mailingListSubscribers" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "mailingListSubscribers_by_email_list" ON "mailingListSubscribers" USING btree ("email","list","_creationTime");--> statement-breakpoint
CREATE INDEX "mailingListSubscribers_by_list_status" ON "mailingListSubscribers" USING btree ("list","status","_creationTime");--> statement-breakpoint
CREATE INDEX "memberships_by_creation_time" ON "memberships" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "memberships_by_email" ON "memberships" USING btree ("email","_creationTime");--> statement-breakpoint
CREATE INDEX "memberships_by_username" ON "memberships" USING btree ("username","_creationTime");--> statement-breakpoint
CREATE INDEX "memberships_by_role" ON "memberships" USING btree ("role","_creationTime");--> statement-breakpoint
CREATE INDEX "memberships_by_provider_account" ON "memberships" USING btree ("provider","providerAccountId","_creationTime");--> statement-breakpoint
CREATE INDEX "memberships_by_reset_token_hash" ON "memberships" USING btree ("resetTokenHash","_creationTime");--> statement-breakpoint
CREATE INDEX "moleculeClassTemplates_by_creation_time" ON "moleculeClassTemplates" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "moleculeClassTemplates_by_class_key" ON "moleculeClassTemplates" USING btree ("classKey","_creationTime");--> statement-breakpoint
CREATE INDEX "moleculeOverrides_by_creation_time" ON "moleculeOverrides" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "moleculeOverrides_by_slug" ON "moleculeOverrides" USING btree ("slug","_creationTime");--> statement-breakpoint
CREATE INDEX "narrativeRevisions_by_creation_time" ON "narrativeRevisions" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "narrativeRevisions_by_target" ON "narrativeRevisions" USING btree ("kind","key","_creationTime");--> statement-breakpoint
CREATE INDEX "narrativeRevisions_by_document" ON "narrativeRevisions" USING btree ("kind","documentId","_creationTime");--> statement-breakpoint
CREATE INDEX "narrativeRevisions_by_operation" ON "narrativeRevisions" USING btree ("kind","operationId","_creationTime");--> statement-breakpoint
CREATE INDEX "prompts_by_creation_time" ON "prompts" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "prompts_by_key" ON "prompts" USING btree ("key","_creationTime");--> statement-breakpoint
CREATE INDEX "publicCachePublications_by_creation_time" ON "publicCachePublications" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "publicCachePublications_by_key" ON "publicCachePublications" USING btree ("key","_creationTime");--> statement-breakpoint
CREATE INDEX "publicCachePublications_by_due" ON "publicCachePublications" USING btree ("pending","nextAttemptAt","_creationTime");--> statement-breakpoint
CREATE INDEX "publicReadIndexState_by_creation_time" ON "publicReadIndexState" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "publicReadIndexState_by_name" ON "publicReadIndexState" USING btree ("name","_creationTime");--> statement-breakpoint
CREATE INDEX "quotes_by_creation_time" ON "quotes" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "quotes_by_slug_section" ON "quotes" USING btree ("slug","section","_creationTime");--> statement-breakpoint
CREATE INDEX "quotes_by_section" ON "quotes" USING btree ("section","_creationTime");--> statement-breakpoint
CREATE INDEX "reagentTests_by_creation_time" ON "reagentTests" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "reagentTests_by_slug" ON "reagentTests" USING btree ("slug","_creationTime");--> statement-breakpoint
CREATE INDEX "reagentTests_by_snapshot_hash" ON "reagentTests" USING btree ("snapshotHash","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationArtistTaxonomy_by_creation_time" ON "replicationArtistTaxonomy" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "replicationArtistTaxonomy_by_key" ON "replicationArtistTaxonomy" USING btree ("key","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationDateResearch_by_creation_time" ON "replicationDateResearch" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "replicationDateResearch_by_replication_id" ON "replicationDateResearch" USING btree ("replication_id","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationDuplicateReconciliations_by_creation_time" ON "replicationDuplicateReconciliations" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "replicationDuplicateReconciliations_by_component_id" ON "replicationDuplicateReconciliations" USING btree ("component_id","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationDuplicateReconciliations_by_keeper_replication_id" ON "replicationDuplicateReconciliations" USING btree ("keeper_replication_id","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationDuplicateReconciliations_by_suppressed_repl_4d201796" ON "replicationDuplicateReconciliations" USING btree ("suppressed_replication_id","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationEditReceipts_by_creation_time" ON "replicationEditReceipts" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "replicationEditReceipts_by_actor_request" ON "replicationEditReceipts" USING btree ("actorEmail","requestId","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationEditReceipts_by_target" ON "replicationEditReceipts" USING btree ("target","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationGalleryCandidates_by_creation_time" ON "replicationGalleryCandidates" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "replicationGalleryCandidates_by_candidate" ON "replicationGalleryCandidates" USING btree ("candidate_key","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationGalleryCandidates_by_replication" ON "replicationGalleryCandidates" USING btree ("replication_id","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentityAttributions_by_creation_time" ON "replicationIdentityAttributions" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentityAttributions_by_replication_id" ON "replicationIdentityAttributions" USING btree ("replication_id","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentityAttributions_by_poster_profile_id" ON "replicationIdentityAttributions" USING btree ("poster_profile_id","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentityAttributions_by_creator_profile_id" ON "replicationIdentityAttributions" USING btree ("creator_profile_id","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentityProfileBindings_by_creation_time" ON "replicationIdentityProfileBindings" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentityProfileBindings_by_artist_id" ON "replicationIdentityProfileBindings" USING btree ("artist_id","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentityProfileBindings_by_profile_id" ON "replicationIdentityProfileBindings" USING btree ("profile_id","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentitySocialOperationItems_by_creation_time" ON "replicationIdentitySocialOperationItems" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentitySocialOperationItems_by_item_operation_id" ON "replicationIdentitySocialOperationItems" USING btree ("item_operation_id","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentitySocialOperationItems_by_batch_operation_id" ON "replicationIdentitySocialOperationItems" USING btree ("batch_operation_id","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentitySocialOperations_by_creation_time" ON "replicationIdentitySocialOperations" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentitySocialOperations_by_operation_id" ON "replicationIdentitySocialOperations" USING btree ("operation_id","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentitySocialOperations_by_rollback_of" ON "replicationIdentitySocialOperations" USING btree ("rollback_of","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentitySocialOperations_by_kind_and_created_at" ON "replicationIdentitySocialOperations" USING btree ("kind","created_at","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationPlaylists_by_creation_time" ON "replicationPlaylists" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "replicationPlaylists_by_key" ON "replicationPlaylists" USING btree ("key","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationPlaylists_by_owner_email" ON "replicationPlaylists" USING btree ("owner_email","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationSocialAssets_by_creation_time" ON "replicationSocialAssets" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "replicationSocialAssets_by_entity_kind_and_entity_key" ON "replicationSocialAssets" USING btree ("entity_kind","entity_key","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationSocialAssets_by_entity_kind_and_entity_key__d640c881" ON "replicationSocialAssets" USING btree ("entity_kind","entity_key","variant","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationSocialAssets_by_status" ON "replicationSocialAssets" USING btree ("status","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationSourceAttribution_by_creation_time" ON "replicationSourceAttribution" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "replicationSourceAttribution_by_replication_id" ON "replicationSourceAttribution" USING btree ("replication_id","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationSourceAttribution_by_source_catalog_id" ON "replicationSourceAttribution" USING btree ("source_catalog_id","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationSourceAttribution_by_source_sha256" ON "replicationSourceAttribution" USING btree ("source_sha256","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationTaxonomyEvidence_by_creation_time" ON "replicationTaxonomyEvidence" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "replicationTaxonomyEvidence_by_replication_id" ON "replicationTaxonomyEvidence" USING btree ("replication_id","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationTaxonomyEvidence_by_replication_digest" ON "replicationTaxonomyEvidence" USING btree ("replication_id","taxonomy_source_digest","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationTaxonomyEvidence_by_source_catalog_id" ON "replicationTaxonomyEvidence" USING btree ("source_catalog_id","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationTaxonomyEvidence_by_taxonomy_record_key" ON "replicationTaxonomyEvidence" USING btree ("taxonomy_record_key","_creationTime");--> statement-breakpoint
CREATE INDEX "replications_by_creation_time" ON "replications" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "replications_by_effect" ON "replications" USING btree ("effect_slug","_creationTime");--> statement-breakpoint
CREATE INDEX "replications_by_slug" ON "replications" USING btree ("slug","_creationTime");--> statement-breakpoint
CREATE INDEX "replications_by_artist" ON "replications" USING btree ("artist","_creationTime");--> statement-breakpoint
CREATE INDEX "replications_by_source_sha256" ON "replications" USING btree ("source_sha256","_creationTime");--> statement-breakpoint
CREATE INDEX "replications_by_source_catalog_id" ON "replications" USING btree ("source_catalog_id","_creationTime");--> statement-breakpoint
CREATE INDEX "replications_by_taxonomy_record_key" ON "replications" USING btree ("taxonomy_record_key","_creationTime");--> statement-breakpoint
CREATE INDEX "replications_by_replication_status" ON "replications" USING btree ("replication_status","_creationTime");--> statement-breakpoint
CREATE INDEX "reviewedArticles_by_creation_time" ON "reviewedArticles" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "reviewedArticles_by_article" ON "reviewedArticles" USING btree ("article_id","_creationTime");--> statement-breakpoint
CREATE INDEX "reviewedArticles_by_reviewer" ON "reviewedArticles" USING btree ("reviewer_email","source_created","article_id","_creationTime");--> statement-breakpoint
CREATE INDEX "siteConfig_by_creation_time" ON "siteConfig" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "siteConfig_by_key" ON "siteConfig" USING btree ("key","_creationTime");--> statement-breakpoint
CREATE INDEX "siteFeedback_by_creation_time" ON "siteFeedback" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "siteFeedback_by_status_created" ON "siteFeedback" USING btree ("status","created_at","_creationTime");--> statement-breakpoint
CREATE INDEX "siteFeedback_by_created_at" ON "siteFeedback" USING btree ("created_at","_creationTime");--> statement-breakpoint
CREATE INDEX "siteFeedback_by_public_id" ON "siteFeedback" USING btree ("id","_creationTime");--> statement-breakpoint
CREATE INDEX "subjectiveEffects_by_creation_time" ON "subjectiveEffects" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "subjectiveEffects_by_slug" ON "subjectiveEffects" USING btree ("slug","_creationTime");--> statement-breakpoint
CREATE INDEX "subjectiveEffects_by_featured" ON "subjectiveEffects" USING btree ("featured","_creationTime");--> statement-breakpoint
CREATE INDEX "substanceGalleries_by_creation_time" ON "substanceGalleries" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "substanceGalleries_by_substance" ON "substanceGalleries" USING btree ("substance_slug","_creationTime");--> statement-breakpoint
CREATE INDEX "substanceIndex_by_creation_time" ON "substanceIndex" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "substanceIndex_by_title" ON "substanceIndex" USING btree ("title","_creationTime");--> statement-breakpoint
CREATE INDEX "substanceIndex_by_article_id" ON "substanceIndex" USING btree ("id","_creationTime");--> statement-breakpoint
CREATE INDEX "substanceIndex_by_slug" ON "substanceIndex" USING btree ("slug","_creationTime");--> statement-breakpoint
CREATE INDEX "substanceIndex_by_priority" ON "substanceIndex" USING btree ("priority","_creationTime");--> statement-breakpoint
CREATE INDEX "tripReportSubmissions_by_creation_time" ON "tripReportSubmissions" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "tripReportSubmissions_by_status_created" ON "tripReportSubmissions" USING btree ("status","created_at","_creationTime");--> statement-breakpoint
CREATE INDEX "tripReportSubmissions_by_created_at" ON "tripReportSubmissions" USING btree ("created_at","_creationTime");--> statement-breakpoint
CREATE INDEX "tripReportSubmissions_by_public_id" ON "tripReportSubmissions" USING btree ("id","_creationTime");--> statement-breakpoint
CREATE INDEX "tripReportSubstances_by_creation_time" ON "tripReportSubstances" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "tripReportSubstances_by_name_lower" ON "tripReportSubstances" USING btree ("name_lower","_creationTime");--> statement-breakpoint
CREATE INDEX "tripReportSubstances_by_report" ON "tripReportSubstances" USING btree ("report_id","_creationTime");--> statement-breakpoint
CREATE INDEX "tripReports_by_creation_time" ON "tripReports" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "tripReports_by_slug" ON "tripReports" USING btree ("slug","_creationTime");--> statement-breakpoint
CREATE INDEX "tripReports_by_owner_email" ON "tripReports" USING btree ("owner_email","_creationTime");--> statement-breakpoint
CREATE INDEX "tripReports_by_featured" ON "tripReports" USING btree ("featured","_creationTime");--> statement-breakpoint
CREATE INDEX "tripReports_by_subject_profile_key" ON "tripReports" USING btree (("subject"->>'profile_key'),"_creationTime");--> statement-breakpoint
CREATE INDEX "warningBannerPresets_by_creation_time" ON "warningBannerPresets" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "warningBannerPresets_by_key" ON "warningBannerPresets" USING btree ("key","_creationTime");--> statement-breakpoint
CREATE INDEX "warningBannerRevisions_by_creation_time" ON "warningBannerRevisions" USING btree ("_creationTime");--> statement-breakpoint
CREATE INDEX "warningBannerRevisions_by_key" ON "warningBannerRevisions" USING btree ("key","_creationTime");--> statement-breakpoint
CREATE INDEX "warningBannerRevisions_by_change" ON "warningBannerRevisions" USING btree ("changeId","_creationTime");