DROP INDEX "changeProposals_by_created_at_unique";--> statement-breakpoint
DROP INDEX "replicationIdentitySocialOperations_by_rollback_of_unique";--> statement-breakpoint
DROP INDEX "replications_by_slug_unique";--> statement-breakpoint
DROP INDEX "warningBannerRevisions_by_key_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "articleProposalTargets_by_proposal_slug_unique" ON "articleProposalTargets" USING btree ("proposalId" COLLATE "C","slug" COLLATE "C");--> statement-breakpoint
CREATE UNIQUE INDEX "contributorAliasEvidence_by_profile_id_and_normalized__966707ed" ON "contributorAliasEvidence" USING btree ("profile_id" COLLATE "C","normalized_alias" COLLATE "C");--> statement-breakpoint
CREATE UNIQUE INDEX "contributorIdentityTokenSnapshots_by_snapshot_digest_a_28e78500" ON "contributorIdentityTokenSnapshots" USING btree ("snapshot_digest" COLLATE "C","normalized_token" COLLATE "C");--> statement-breakpoint
CREATE UNIQUE INDEX "contributorProfileMergeOperations_by_operation_id_unique" ON "contributorProfileMergeOperations" USING btree ("operation_id" COLLATE "C");--> statement-breakpoint
CREATE UNIQUE INDEX "contributorProfileMergeOperations_by_rollback_operatio_7c144253" ON "contributorProfileMergeOperations" USING btree ("rollback_operation_id" COLLATE "C");--> statement-breakpoint
CREATE UNIQUE INDEX "contributorReplicatorVerifications_by_profile_id_unique" ON "contributorReplicatorVerifications" USING btree ("profile_id" COLLATE "C");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_by_email_unique" ON "memberships" USING btree ("email" COLLATE "C");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_by_username_unique" ON "memberships" USING btree ("username" COLLATE "C");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_by_reset_token_hash_unique" ON "memberships" USING btree ("resetTokenHash" COLLATE "C");--> statement-breakpoint
CREATE UNIQUE INDEX "replicationIdentityAttributions_by_replication_id_unique" ON "replicationIdentityAttributions" USING btree ("replication_id" COLLATE "C");