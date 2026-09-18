DROP INDEX "articleDraftReceipts_by_owner_change_unique";--> statement-breakpoint
DROP INDEX "articleDraftReceipts_by_owner_change";--> statement-breakpoint
DROP INDEX "articleDrafts_by_owner_slug_unique";--> statement-breakpoint
DROP INDEX "articleDrafts_by_owner_slug";--> statement-breakpoint
DROP INDEX "articleFeedback_by_status_created";--> statement-breakpoint
DROP INDEX "articleFeedback_by_created_at";--> statement-breakpoint
DROP INDEX "articleFeedback_by_public_id";--> statement-breakpoint
DROP INDEX "articleFeedback_by_substance";--> statement-breakpoint
DROP INDEX "articleHistory_by_slug_created";--> statement-breakpoint
DROP INDEX "articleHistory_by_changelog";--> statement-breakpoint
DROP INDEX "articleProposalTargets_by_slug_created";--> statement-breakpoint
DROP INDEX "articleProposalTargets_by_owner_slug_created";--> statement-breakpoint
DROP INDEX "articleProposalTargets_by_proposal_slug";--> statement-breakpoint
DROP INDEX "articleRevisions_by_slug";--> statement-breakpoint
DROP INDEX "articleRevisions_by_actor_change_unique";--> statement-breakpoint
DROP INDEX "articleRevisions_by_actor_change";--> statement-breakpoint
DROP INDEX "articleSources_by_slug";--> statement-breakpoint
DROP INDEX "changeProposals_by_status";--> statement-breakpoint
DROP INDEX "changeProposals_by_proposed_by";--> statement-breakpoint
DROP INDEX "changeProposals_by_proposed_by_status";--> statement-breakpoint
DROP INDEX "changeProposals_by_created_at_unique";--> statement-breakpoint
DROP INDEX "changeProposals_by_created_at";--> statement-breakpoint
DROP INDEX "changelog_by_entry_id";--> statement-breakpoint
DROP INDEX "changelog_by_created_at";--> statement-breakpoint
DROP INDEX "changelog_by_submitted_by";--> statement-breakpoint
DROP INDEX "citationEvidence_by_slug";--> statement-breakpoint
DROP INDEX "citationEvidence_by_slug_section";--> statement-breakpoint
DROP INDEX "citationEvidence_by_slug_claim";--> statement-breakpoint
DROP INDEX "citationEvidence_by_status";--> statement-breakpoint
DROP INDEX "contentRevisions_by_table_key";--> statement-breakpoint
DROP INDEX "contentRevisions_by_operation_unique";--> statement-breakpoint
DROP INDEX "contentRevisions_by_operation";--> statement-breakpoint
DROP INDEX "contentRevisions_by_created_at";--> statement-breakpoint
DROP INDEX "contributorAliasEvidence_by_profile_id";--> statement-breakpoint
DROP INDEX "contributorAliasEvidence_by_profile_id_and_normalized_alias";--> statement-breakpoint
DROP INDEX "contributorAliasEvidence_by_normalized_alias";--> statement-breakpoint
DROP INDEX "contributorAvatarHistory_by_profile_id";--> statement-breakpoint
DROP INDEX "contributorAvatarHistory_by_profile_id_and_recorded_at";--> statement-breakpoint
DROP INDEX "contributorAvatarHistory_by_profile_id_and_media_digest_unique";--> statement-breakpoint
DROP INDEX "contributorAvatarHistory_by_profile_id_and_media_digest";--> statement-breakpoint
DROP INDEX "contributorIdentitySnapshotMaterializations_by_snapsho_bc392845";--> statement-breakpoint
DROP INDEX "contributorIdentitySnapshotMaterializations_by_snapshot_digest";--> statement-breakpoint
DROP INDEX "contributorIdentitySnapshotMaterializations_by_operation_id";--> statement-breakpoint
DROP INDEX "contributorIdentityTokenSnapshots_by_snapshot_digest_a_32d0efe4";--> statement-breakpoint
DROP INDEX "contributorProfileMergeItems_by_operation_id_and_ordinal";--> statement-breakpoint
DROP INDEX "contributorProfileMergeOperations_by_operation_id";--> statement-breakpoint
DROP INDEX "contributorProfileMergeOperations_by_rollback_operation_id";--> statement-breakpoint
DROP INDEX "contributorProfileMergeOperations_by_source_profile_id";--> statement-breakpoint
DROP INDEX "contributorProfileMergeOperations_by_target_profile_id";--> statement-breakpoint
DROP INDEX "contributorProfiles_by_key_unique";--> statement-breakpoint
DROP INDEX "contributorProfiles_by_key";--> statement-breakpoint
DROP INDEX "contributorProfiles_by_display_name";--> statement-breakpoint
DROP INDEX "contributorProfiles_by_membership_email";--> statement-breakpoint
DROP INDEX "contributorReplicatorVerifications_by_profile_id";--> statement-breakpoint
DROP INDEX "contributorReplicatorVerifications_by_status";--> statement-breakpoint
DROP INDEX "copyBlocks_by_key_unique";--> statement-breakpoint
DROP INDEX "copyBlocks_by_key";--> statement-breakpoint
DROP INDEX "copyBlocks_by_group";--> statement-breakpoint
DROP INDEX "effectIndexArchive_by_kind_key";--> statement-breakpoint
DROP INDEX "effectIndexArticles_by_slug";--> statement-breakpoint
DROP INDEX "effectIndexArticles_by_kind_status_date";--> statement-breakpoint
DROP INDEX "generatedPublicationOperations_by_proposal_id_unique";--> statement-breakpoint
DROP INDEX "generatedPublicationOperations_by_proposal_id";--> statement-breakpoint
DROP INDEX "generatedPublicationOperations_by_slug_created";--> statement-breakpoint
DROP INDEX "indexLayouts_by_type";--> statement-breakpoint
DROP INDEX "inviteCodes_by_code_hash_unique";--> statement-breakpoint
DROP INDEX "inviteCodes_by_code_hash";--> statement-breakpoint
DROP INDEX "inviteCodes_by_created_at";--> statement-breakpoint
DROP INDEX "mailingListSubscribers_by_email_list_unique";--> statement-breakpoint
DROP INDEX "mailingListSubscribers_by_email_list";--> statement-breakpoint
DROP INDEX "mailingListSubscribers_by_list_status";--> statement-breakpoint
DROP INDEX "memberships_by_email";--> statement-breakpoint
DROP INDEX "memberships_by_username";--> statement-breakpoint
DROP INDEX "memberships_by_role";--> statement-breakpoint
DROP INDEX "memberships_by_provider_account";--> statement-breakpoint
DROP INDEX "memberships_by_reset_token_hash";--> statement-breakpoint
DROP INDEX "moleculeClassTemplates_by_class_key";--> statement-breakpoint
DROP INDEX "moleculeOverrides_by_slug";--> statement-breakpoint
DROP INDEX "narrativeRevisions_by_target";--> statement-breakpoint
DROP INDEX "narrativeRevisions_by_document";--> statement-breakpoint
DROP INDEX "narrativeRevisions_by_operation";--> statement-breakpoint
DROP INDEX "prompts_by_key";--> statement-breakpoint
DROP INDEX "publicCachePublications_by_key_unique";--> statement-breakpoint
DROP INDEX "publicCachePublications_by_key";--> statement-breakpoint
DROP INDEX "publicReadIndexState_by_name_unique";--> statement-breakpoint
DROP INDEX "publicReadIndexState_by_name";--> statement-breakpoint
DROP INDEX "quotes_by_slug_section";--> statement-breakpoint
DROP INDEX "quotes_by_section";--> statement-breakpoint
DROP INDEX "reagentTests_by_slug";--> statement-breakpoint
DROP INDEX "reagentTests_by_snapshot_hash";--> statement-breakpoint
DROP INDEX "replicationArtistTaxonomy_by_key_unique";--> statement-breakpoint
DROP INDEX "replicationArtistTaxonomy_by_key";--> statement-breakpoint
DROP INDEX "replicationDateResearch_by_replication_id";--> statement-breakpoint
DROP INDEX "replicationDuplicateReconciliations_by_component_id_unique";--> statement-breakpoint
DROP INDEX "replicationDuplicateReconciliations_by_component_id";--> statement-breakpoint
DROP INDEX "replicationDuplicateReconciliations_by_keeper_replication_id";--> statement-breakpoint
DROP INDEX "replicationDuplicateReconciliations_by_suppressed_repl_76896446";--> statement-breakpoint
DROP INDEX "replicationDuplicateReconciliations_by_suppressed_repl_4d201796";--> statement-breakpoint
DROP INDEX "replicationEditReceipts_by_actor_request";--> statement-breakpoint
DROP INDEX "replicationEditReceipts_by_target";--> statement-breakpoint
DROP INDEX "replicationGalleryCandidates_by_candidate";--> statement-breakpoint
DROP INDEX "replicationGalleryCandidates_by_replication";--> statement-breakpoint
DROP INDEX "replicationIdentityAttributions_by_replication_id";--> statement-breakpoint
DROP INDEX "replicationIdentityAttributions_by_poster_profile_id";--> statement-breakpoint
DROP INDEX "replicationIdentityAttributions_by_creator_profile_id";--> statement-breakpoint
DROP INDEX "replicationIdentityProfileBindings_by_artist_id_unique";--> statement-breakpoint
DROP INDEX "replicationIdentityProfileBindings_by_artist_id";--> statement-breakpoint
DROP INDEX "replicationIdentityProfileBindings_by_profile_id";--> statement-breakpoint
DROP INDEX "replicationIdentitySocialOperationItems_by_item_operat_c5ce8bf3";--> statement-breakpoint
DROP INDEX "replicationIdentitySocialOperationItems_by_item_operation_id";--> statement-breakpoint
DROP INDEX "replicationIdentitySocialOperationItems_by_batch_operation_id";--> statement-breakpoint
DROP INDEX "replicationIdentitySocialOperations_by_operation_id_unique";--> statement-breakpoint
DROP INDEX "replicationIdentitySocialOperations_by_operation_id";--> statement-breakpoint
DROP INDEX "replicationIdentitySocialOperations_by_rollback_of_unique";--> statement-breakpoint
DROP INDEX "replicationIdentitySocialOperations_by_rollback_of";--> statement-breakpoint
DROP INDEX "replicationIdentitySocialOperations_by_kind_and_created_at";--> statement-breakpoint
DROP INDEX "replicationPlaylists_by_key";--> statement-breakpoint
DROP INDEX "replicationPlaylists_by_owner_email";--> statement-breakpoint
DROP INDEX "replicationSocialAssets_by_entity_kind_and_entity_key";--> statement-breakpoint
DROP INDEX "replicationSocialAssets_by_entity_kind_and_entity_key__b9c43fd4";--> statement-breakpoint
DROP INDEX "replicationSocialAssets_by_entity_kind_and_entity_key__d640c881";--> statement-breakpoint
DROP INDEX "replicationSocialAssets_by_status";--> statement-breakpoint
DROP INDEX "replicationSourceAttribution_by_replication_id_unique";--> statement-breakpoint
DROP INDEX "replicationSourceAttribution_by_replication_id";--> statement-breakpoint
DROP INDEX "replicationSourceAttribution_by_source_catalog_id";--> statement-breakpoint
DROP INDEX "replicationSourceAttribution_by_source_sha256";--> statement-breakpoint
DROP INDEX "replicationTaxonomyEvidence_by_replication_id";--> statement-breakpoint
DROP INDEX "replicationTaxonomyEvidence_by_replication_digest_unique";--> statement-breakpoint
DROP INDEX "replicationTaxonomyEvidence_by_replication_digest";--> statement-breakpoint
DROP INDEX "replicationTaxonomyEvidence_by_source_catalog_id";--> statement-breakpoint
DROP INDEX "replicationTaxonomyEvidence_by_taxonomy_record_key";--> statement-breakpoint
DROP INDEX "replications_by_effect";--> statement-breakpoint
DROP INDEX "replications_by_slug_unique";--> statement-breakpoint
DROP INDEX "replications_by_slug";--> statement-breakpoint
DROP INDEX "replications_by_artist";--> statement-breakpoint
DROP INDEX "replications_by_source_sha256";--> statement-breakpoint
DROP INDEX "replications_by_source_catalog_id_unique";--> statement-breakpoint
DROP INDEX "replications_by_source_catalog_id";--> statement-breakpoint
DROP INDEX "replications_by_taxonomy_record_key_unique";--> statement-breakpoint
DROP INDEX "replications_by_taxonomy_record_key";--> statement-breakpoint
DROP INDEX "replications_by_replication_status";--> statement-breakpoint
DROP INDEX "reviewedArticles_by_article_unique";--> statement-breakpoint
DROP INDEX "reviewedArticles_by_article";--> statement-breakpoint
DROP INDEX "reviewedArticles_by_reviewer";--> statement-breakpoint
DROP INDEX "siteConfig_by_key";--> statement-breakpoint
DROP INDEX "siteFeedback_by_status_created";--> statement-breakpoint
DROP INDEX "siteFeedback_by_created_at";--> statement-breakpoint
DROP INDEX "siteFeedback_by_public_id";--> statement-breakpoint
DROP INDEX "subjectiveEffects_by_slug";--> statement-breakpoint
DROP INDEX "substanceGalleries_by_substance";--> statement-breakpoint
DROP INDEX "substanceIndex_by_title";--> statement-breakpoint
DROP INDEX "substanceIndex_by_slug_unique";--> statement-breakpoint
DROP INDEX "substanceIndex_by_slug";--> statement-breakpoint
DROP INDEX "tripReportSubmissions_by_status_created";--> statement-breakpoint
DROP INDEX "tripReportSubmissions_by_created_at";--> statement-breakpoint
DROP INDEX "tripReportSubmissions_by_public_id";--> statement-breakpoint
DROP INDEX "tripReportSubstances_by_name_lower";--> statement-breakpoint
DROP INDEX "tripReportSubstances_by_report";--> statement-breakpoint
DROP INDEX "tripReports_by_slug_unique";--> statement-breakpoint
DROP INDEX "tripReports_by_slug";--> statement-breakpoint
DROP INDEX "tripReports_by_owner_email";--> statement-breakpoint
DROP INDEX "tripReports_by_subject_profile_key";--> statement-breakpoint
DROP INDEX "warningBannerPresets_by_key_unique";--> statement-breakpoint
DROP INDEX "warningBannerPresets_by_key";--> statement-breakpoint
DROP INDEX "warningBannerRevisions_by_key_unique";--> statement-breakpoint
DROP INDEX "warningBannerRevisions_by_key";--> statement-breakpoint
DROP INDEX "warningBannerRevisions_by_change_unique";--> statement-breakpoint
DROP INDEX "warningBannerRevisions_by_change";--> statement-breakpoint
CREATE UNIQUE INDEX "articleDraftReceipts_by_owner_change_unique" ON "articleDraftReceipts" USING btree ("ownerEmail" COLLATE "C","changeId" COLLATE "C");--> statement-breakpoint
CREATE INDEX "articleDraftReceipts_by_owner_change" ON "articleDraftReceipts" USING btree ("ownerEmail" COLLATE "C","changeId" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "articleDrafts_by_owner_slug_unique" ON "articleDrafts" USING btree ("ownerEmail" COLLATE "C","slug" COLLATE "C");--> statement-breakpoint
CREATE INDEX "articleDrafts_by_owner_slug" ON "articleDrafts" USING btree ("ownerEmail" COLLATE "C","slug" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "articleFeedback_by_status_created" ON "articleFeedback" USING btree ("status" COLLATE "C","created_at" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "articleFeedback_by_created_at" ON "articleFeedback" USING btree ("created_at" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "articleFeedback_by_public_id" ON "articleFeedback" USING btree ("id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "articleFeedback_by_substance" ON "articleFeedback" USING btree ("substance_slug" COLLATE "C","created_at" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "articleHistory_by_slug_created" ON "articleHistory" USING btree ("slug" COLLATE "C","createdAt" COLLATE "C","source_created","changelog_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "articleHistory_by_changelog" ON "articleHistory" USING btree ("changelog_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "articleProposalTargets_by_slug_created" ON "articleProposalTargets" USING btree ("slug" COLLATE "C","createdAt" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "articleProposalTargets_by_owner_slug_created" ON "articleProposalTargets" USING btree ("ownerEmail" COLLATE "C","slug" COLLATE "C","createdAt" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "articleProposalTargets_by_proposal_slug" ON "articleProposalTargets" USING btree ("proposalId" COLLATE "C","slug" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "articleRevisions_by_slug" ON "articleRevisions" USING btree ("slug" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "articleRevisions_by_actor_change_unique" ON "articleRevisions" USING btree ("actorEmail" COLLATE "C","changeId" COLLATE "C");--> statement-breakpoint
CREATE INDEX "articleRevisions_by_actor_change" ON "articleRevisions" USING btree ("actorEmail" COLLATE "C","changeId" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "articleSources_by_slug" ON "articleSources" USING btree ("slug" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "changeProposals_by_status" ON "changeProposals" USING btree ("status" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "changeProposals_by_proposed_by" ON "changeProposals" USING btree ("proposedBy" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "changeProposals_by_proposed_by_status" ON "changeProposals" USING btree ("proposedBy" COLLATE "C","status" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "changeProposals_by_created_at_unique" ON "changeProposals" USING btree ("createdAt" COLLATE "C");--> statement-breakpoint
CREATE INDEX "changeProposals_by_created_at" ON "changeProposals" USING btree ("createdAt" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "changelog_by_entry_id" ON "changelog" USING btree ("entryId" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "changelog_by_created_at" ON "changelog" USING btree ("createdAt" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "changelog_by_submitted_by" ON "changelog" USING btree ("submittedBy" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "citationEvidence_by_slug" ON "citationEvidence" USING btree ("slug" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "citationEvidence_by_slug_section" ON "citationEvidence" USING btree ("slug" COLLATE "C","section" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "citationEvidence_by_slug_claim" ON "citationEvidence" USING btree ("slug" COLLATE "C","claimKey" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "citationEvidence_by_status" ON "citationEvidence" USING btree ("status" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "contentRevisions_by_table_key" ON "contentRevisions" USING btree ("table" COLLATE "C","key" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "contentRevisions_by_operation_unique" ON "contentRevisions" USING btree ("table" COLLATE "C","key" COLLATE "C","operationId" COLLATE "C");--> statement-breakpoint
CREATE INDEX "contentRevisions_by_operation" ON "contentRevisions" USING btree ("table" COLLATE "C","key" COLLATE "C","operationId" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "contentRevisions_by_created_at" ON "contentRevisions" USING btree ("createdAt" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorAliasEvidence_by_profile_id" ON "contributorAliasEvidence" USING btree ("profile_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorAliasEvidence_by_profile_id_and_normalized_alias" ON "contributorAliasEvidence" USING btree ("profile_id" COLLATE "C","normalized_alias" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorAliasEvidence_by_normalized_alias" ON "contributorAliasEvidence" USING btree ("normalized_alias" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorAvatarHistory_by_profile_id" ON "contributorAvatarHistory" USING btree ("profile_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorAvatarHistory_by_profile_id_and_recorded_at" ON "contributorAvatarHistory" USING btree ("profile_id" COLLATE "C","recorded_at","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "contributorAvatarHistory_by_profile_id_and_media_digest_unique" ON "contributorAvatarHistory" USING btree ("profile_id" COLLATE "C","media_digest" COLLATE "C");--> statement-breakpoint
CREATE INDEX "contributorAvatarHistory_by_profile_id_and_media_digest" ON "contributorAvatarHistory" USING btree ("profile_id" COLLATE "C","media_digest" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "contributorIdentitySnapshotMaterializations_by_snapsho_bc392845" ON "contributorIdentitySnapshotMaterializations" USING btree ("snapshot_digest" COLLATE "C");--> statement-breakpoint
CREATE INDEX "contributorIdentitySnapshotMaterializations_by_snapshot_digest" ON "contributorIdentitySnapshotMaterializations" USING btree ("snapshot_digest" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorIdentitySnapshotMaterializations_by_operation_id" ON "contributorIdentitySnapshotMaterializations" USING btree ("operation_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorIdentityTokenSnapshots_by_snapshot_digest_a_32d0efe4" ON "contributorIdentityTokenSnapshots" USING btree ("snapshot_digest" COLLATE "C","normalized_token" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorProfileMergeItems_by_operation_id_and_ordinal" ON "contributorProfileMergeItems" USING btree ("operation_id" COLLATE "C","ordinal","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorProfileMergeOperations_by_operation_id" ON "contributorProfileMergeOperations" USING btree ("operation_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorProfileMergeOperations_by_rollback_operation_id" ON "contributorProfileMergeOperations" USING btree ("rollback_operation_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorProfileMergeOperations_by_source_profile_id" ON "contributorProfileMergeOperations" USING btree ("source_profile_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorProfileMergeOperations_by_target_profile_id" ON "contributorProfileMergeOperations" USING btree ("target_profile_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "contributorProfiles_by_key_unique" ON "contributorProfiles" USING btree ("key" COLLATE "C");--> statement-breakpoint
CREATE INDEX "contributorProfiles_by_key" ON "contributorProfiles" USING btree ("key" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorProfiles_by_display_name" ON "contributorProfiles" USING btree ("displayName" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorProfiles_by_membership_email" ON "contributorProfiles" USING btree ("membershipEmail" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorReplicatorVerifications_by_profile_id" ON "contributorReplicatorVerifications" USING btree ("profile_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "contributorReplicatorVerifications_by_status" ON "contributorReplicatorVerifications" USING btree ("status" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "copyBlocks_by_key_unique" ON "copyBlocks" USING btree ("key" COLLATE "C");--> statement-breakpoint
CREATE INDEX "copyBlocks_by_key" ON "copyBlocks" USING btree ("key" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "copyBlocks_by_group" ON "copyBlocks" USING btree ("group" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "effectIndexArchive_by_kind_key" ON "effectIndexArchive" USING btree ("kind" COLLATE "C","key" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "effectIndexArticles_by_slug" ON "effectIndexArticles" USING btree ("slug" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "effectIndexArticles_by_kind_status_date" ON "effectIndexArticles" USING btree ("kind" COLLATE "C","status" COLLATE "C","publicationDate" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "generatedPublicationOperations_by_proposal_id_unique" ON "generatedPublicationOperations" USING btree ("proposalId" COLLATE "C");--> statement-breakpoint
CREATE INDEX "generatedPublicationOperations_by_proposal_id" ON "generatedPublicationOperations" USING btree ("proposalId" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "generatedPublicationOperations_by_slug_created" ON "generatedPublicationOperations" USING btree ("slug" COLLATE "C","createdAt" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "indexLayouts_by_type" ON "indexLayouts" USING btree ("type" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "inviteCodes_by_code_hash_unique" ON "inviteCodes" USING btree ("codeHash" COLLATE "C");--> statement-breakpoint
CREATE INDEX "inviteCodes_by_code_hash" ON "inviteCodes" USING btree ("codeHash" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "inviteCodes_by_created_at" ON "inviteCodes" USING btree ("createdAt" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "mailingListSubscribers_by_email_list_unique" ON "mailingListSubscribers" USING btree ("email" COLLATE "C","list" COLLATE "C");--> statement-breakpoint
CREATE INDEX "mailingListSubscribers_by_email_list" ON "mailingListSubscribers" USING btree ("email" COLLATE "C","list" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "mailingListSubscribers_by_list_status" ON "mailingListSubscribers" USING btree ("list" COLLATE "C","status" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "memberships_by_email" ON "memberships" USING btree ("email" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "memberships_by_username" ON "memberships" USING btree ("username" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "memberships_by_role" ON "memberships" USING btree ("role" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "memberships_by_provider_account" ON "memberships" USING btree ("provider" COLLATE "C","providerAccountId" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "memberships_by_reset_token_hash" ON "memberships" USING btree ("resetTokenHash" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "moleculeClassTemplates_by_class_key" ON "moleculeClassTemplates" USING btree ("classKey" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "moleculeOverrides_by_slug" ON "moleculeOverrides" USING btree ("slug" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "narrativeRevisions_by_target" ON "narrativeRevisions" USING btree ("kind" COLLATE "C","key" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "narrativeRevisions_by_document" ON "narrativeRevisions" USING btree ("kind" COLLATE "C","documentId" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "narrativeRevisions_by_operation" ON "narrativeRevisions" USING btree ("kind" COLLATE "C","operationId" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "prompts_by_key" ON "prompts" USING btree ("key" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "publicCachePublications_by_key_unique" ON "publicCachePublications" USING btree ("key" COLLATE "C");--> statement-breakpoint
CREATE INDEX "publicCachePublications_by_key" ON "publicCachePublications" USING btree ("key" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "publicReadIndexState_by_name_unique" ON "publicReadIndexState" USING btree ("name" COLLATE "C");--> statement-breakpoint
CREATE INDEX "publicReadIndexState_by_name" ON "publicReadIndexState" USING btree ("name" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "quotes_by_slug_section" ON "quotes" USING btree ("slug" COLLATE "C","section" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "quotes_by_section" ON "quotes" USING btree ("section" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "reagentTests_by_slug" ON "reagentTests" USING btree ("slug" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "reagentTests_by_snapshot_hash" ON "reagentTests" USING btree ("snapshotHash" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "replicationArtistTaxonomy_by_key_unique" ON "replicationArtistTaxonomy" USING btree ("key" COLLATE "C");--> statement-breakpoint
CREATE INDEX "replicationArtistTaxonomy_by_key" ON "replicationArtistTaxonomy" USING btree ("key" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationDateResearch_by_replication_id" ON "replicationDateResearch" USING btree ("replication_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "replicationDuplicateReconciliations_by_component_id_unique" ON "replicationDuplicateReconciliations" USING btree ("component_id" COLLATE "C");--> statement-breakpoint
CREATE INDEX "replicationDuplicateReconciliations_by_component_id" ON "replicationDuplicateReconciliations" USING btree ("component_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationDuplicateReconciliations_by_keeper_replication_id" ON "replicationDuplicateReconciliations" USING btree ("keeper_replication_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "replicationDuplicateReconciliations_by_suppressed_repl_76896446" ON "replicationDuplicateReconciliations" USING btree ("suppressed_replication_id" COLLATE "C");--> statement-breakpoint
CREATE INDEX "replicationDuplicateReconciliations_by_suppressed_repl_4d201796" ON "replicationDuplicateReconciliations" USING btree ("suppressed_replication_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationEditReceipts_by_actor_request" ON "replicationEditReceipts" USING btree ("actorEmail" COLLATE "C","requestId" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationEditReceipts_by_target" ON "replicationEditReceipts" USING btree ("target" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationGalleryCandidates_by_candidate" ON "replicationGalleryCandidates" USING btree ("candidate_key" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationGalleryCandidates_by_replication" ON "replicationGalleryCandidates" USING btree ("replication_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentityAttributions_by_replication_id" ON "replicationIdentityAttributions" USING btree ("replication_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentityAttributions_by_poster_profile_id" ON "replicationIdentityAttributions" USING btree ("poster_profile_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentityAttributions_by_creator_profile_id" ON "replicationIdentityAttributions" USING btree ("creator_profile_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "replicationIdentityProfileBindings_by_artist_id_unique" ON "replicationIdentityProfileBindings" USING btree ("artist_id" COLLATE "C");--> statement-breakpoint
CREATE INDEX "replicationIdentityProfileBindings_by_artist_id" ON "replicationIdentityProfileBindings" USING btree ("artist_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentityProfileBindings_by_profile_id" ON "replicationIdentityProfileBindings" USING btree ("profile_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "replicationIdentitySocialOperationItems_by_item_operat_c5ce8bf3" ON "replicationIdentitySocialOperationItems" USING btree ("item_operation_id" COLLATE "C");--> statement-breakpoint
CREATE INDEX "replicationIdentitySocialOperationItems_by_item_operation_id" ON "replicationIdentitySocialOperationItems" USING btree ("item_operation_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentitySocialOperationItems_by_batch_operation_id" ON "replicationIdentitySocialOperationItems" USING btree ("batch_operation_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "replicationIdentitySocialOperations_by_operation_id_unique" ON "replicationIdentitySocialOperations" USING btree ("operation_id" COLLATE "C");--> statement-breakpoint
CREATE INDEX "replicationIdentitySocialOperations_by_operation_id" ON "replicationIdentitySocialOperations" USING btree ("operation_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "replicationIdentitySocialOperations_by_rollback_of_unique" ON "replicationIdentitySocialOperations" USING btree ("rollback_of" COLLATE "C");--> statement-breakpoint
CREATE INDEX "replicationIdentitySocialOperations_by_rollback_of" ON "replicationIdentitySocialOperations" USING btree ("rollback_of" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationIdentitySocialOperations_by_kind_and_created_at" ON "replicationIdentitySocialOperations" USING btree ("kind" COLLATE "C","created_at","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationPlaylists_by_key" ON "replicationPlaylists" USING btree ("key" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationPlaylists_by_owner_email" ON "replicationPlaylists" USING btree ("owner_email" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationSocialAssets_by_entity_kind_and_entity_key" ON "replicationSocialAssets" USING btree ("entity_kind" COLLATE "C","entity_key" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "replicationSocialAssets_by_entity_kind_and_entity_key__b9c43fd4" ON "replicationSocialAssets" USING btree ("entity_kind" COLLATE "C","entity_key" COLLATE "C","variant" COLLATE "C");--> statement-breakpoint
CREATE INDEX "replicationSocialAssets_by_entity_kind_and_entity_key__d640c881" ON "replicationSocialAssets" USING btree ("entity_kind" COLLATE "C","entity_key" COLLATE "C","variant" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationSocialAssets_by_status" ON "replicationSocialAssets" USING btree ("status" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "replicationSourceAttribution_by_replication_id_unique" ON "replicationSourceAttribution" USING btree ("replication_id" COLLATE "C");--> statement-breakpoint
CREATE INDEX "replicationSourceAttribution_by_replication_id" ON "replicationSourceAttribution" USING btree ("replication_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationSourceAttribution_by_source_catalog_id" ON "replicationSourceAttribution" USING btree ("source_catalog_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationSourceAttribution_by_source_sha256" ON "replicationSourceAttribution" USING btree ("source_sha256" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationTaxonomyEvidence_by_replication_id" ON "replicationTaxonomyEvidence" USING btree ("replication_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "replicationTaxonomyEvidence_by_replication_digest_unique" ON "replicationTaxonomyEvidence" USING btree ("replication_id" COLLATE "C","taxonomy_source_digest" COLLATE "C");--> statement-breakpoint
CREATE INDEX "replicationTaxonomyEvidence_by_replication_digest" ON "replicationTaxonomyEvidence" USING btree ("replication_id" COLLATE "C","taxonomy_source_digest" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationTaxonomyEvidence_by_source_catalog_id" ON "replicationTaxonomyEvidence" USING btree ("source_catalog_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replicationTaxonomyEvidence_by_taxonomy_record_key" ON "replicationTaxonomyEvidence" USING btree ("taxonomy_record_key" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replications_by_effect" ON "replications" USING btree ("effect_slug" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "replications_by_slug_unique" ON "replications" USING btree ("slug" COLLATE "C");--> statement-breakpoint
CREATE INDEX "replications_by_slug" ON "replications" USING btree ("slug" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replications_by_artist" ON "replications" USING btree ("artist" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replications_by_source_sha256" ON "replications" USING btree ("source_sha256" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "replications_by_source_catalog_id_unique" ON "replications" USING btree ("source_catalog_id" COLLATE "C");--> statement-breakpoint
CREATE INDEX "replications_by_source_catalog_id" ON "replications" USING btree ("source_catalog_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "replications_by_taxonomy_record_key_unique" ON "replications" USING btree ("taxonomy_record_key" COLLATE "C");--> statement-breakpoint
CREATE INDEX "replications_by_taxonomy_record_key" ON "replications" USING btree ("taxonomy_record_key" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "replications_by_replication_status" ON "replications" USING btree ("replication_status" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "reviewedArticles_by_article_unique" ON "reviewedArticles" USING btree ("article_id" COLLATE "C");--> statement-breakpoint
CREATE INDEX "reviewedArticles_by_article" ON "reviewedArticles" USING btree ("article_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "reviewedArticles_by_reviewer" ON "reviewedArticles" USING btree ("reviewer_email" COLLATE "C","source_created","article_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "siteConfig_by_key" ON "siteConfig" USING btree ("key" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "siteFeedback_by_status_created" ON "siteFeedback" USING btree ("status" COLLATE "C","created_at" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "siteFeedback_by_created_at" ON "siteFeedback" USING btree ("created_at" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "siteFeedback_by_public_id" ON "siteFeedback" USING btree ("id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "subjectiveEffects_by_slug" ON "subjectiveEffects" USING btree ("slug" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "substanceGalleries_by_substance" ON "substanceGalleries" USING btree ("substance_slug" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "substanceIndex_by_title" ON "substanceIndex" USING btree ("title" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "substanceIndex_by_slug_unique" ON "substanceIndex" USING btree ("slug" COLLATE "C");--> statement-breakpoint
CREATE INDEX "substanceIndex_by_slug" ON "substanceIndex" USING btree ("slug" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "tripReportSubmissions_by_status_created" ON "tripReportSubmissions" USING btree ("status" COLLATE "C","created_at" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "tripReportSubmissions_by_created_at" ON "tripReportSubmissions" USING btree ("created_at" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "tripReportSubmissions_by_public_id" ON "tripReportSubmissions" USING btree ("id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "tripReportSubstances_by_name_lower" ON "tripReportSubstances" USING btree ("name_lower" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "tripReportSubstances_by_report" ON "tripReportSubstances" USING btree ("report_id" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "tripReports_by_slug_unique" ON "tripReports" USING btree ("slug" COLLATE "C");--> statement-breakpoint
CREATE INDEX "tripReports_by_slug" ON "tripReports" USING btree ("slug" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "tripReports_by_owner_email" ON "tripReports" USING btree ("owner_email" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE INDEX "tripReports_by_subject_profile_key" ON "tripReports" USING btree (("subject"->>'profile_key') COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "warningBannerPresets_by_key_unique" ON "warningBannerPresets" USING btree ("key" COLLATE "C");--> statement-breakpoint
CREATE INDEX "warningBannerPresets_by_key" ON "warningBannerPresets" USING btree ("key" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "warningBannerRevisions_by_key_unique" ON "warningBannerRevisions" USING btree ("key" COLLATE "C");--> statement-breakpoint
CREATE INDEX "warningBannerRevisions_by_key" ON "warningBannerRevisions" USING btree ("key" COLLATE "C","_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "warningBannerRevisions_by_change_unique" ON "warningBannerRevisions" USING btree ("changeId" COLLATE "C");--> statement-breakpoint
CREATE INDEX "warningBannerRevisions_by_change" ON "warningBannerRevisions" USING btree ("changeId" COLLATE "C","_creationTime");