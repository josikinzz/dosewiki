CREATE TABLE "documentIds" (
	"_id" text PRIMARY KEY NOT NULL,
	"table" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storageObjects" (
	"storage_id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"content_type" text,
	"size" bigint,
	"sha256" text,
	"r2_key" text
);
--> statement-breakpoint
CREATE INDEX "documentIds_by_table" ON "documentIds" USING btree ("table");
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'articleDraftReceipts' FROM "articleDraftReceipts" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'articleDrafts' FROM "articleDrafts" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'articleFeedback' FROM "articleFeedback" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'articleHistory' FROM "articleHistory" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'articleProposalTargets' FROM "articleProposalTargets" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'articleRevisions' FROM "articleRevisions" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'articleSources' FROM "articleSources" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'categoryLayout' FROM "categoryLayout" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'changelog' FROM "changelog" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'changeProposals' FROM "changeProposals" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'citationEvidence' FROM "citationEvidence" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'contentRevisions' FROM "contentRevisions" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'contributorAliasEvidence' FROM "contributorAliasEvidence" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'contributorAvatarHistory' FROM "contributorAvatarHistory" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'contributorIdentitySnapshotMaterializations' FROM "contributorIdentitySnapshotMaterializations" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'contributorIdentityTokenSnapshots' FROM "contributorIdentityTokenSnapshots" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'contributorProfileMergeItems' FROM "contributorProfileMergeItems" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'contributorProfileMergeOperations' FROM "contributorProfileMergeOperations" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'contributorProfiles' FROM "contributorProfiles" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'contributorReplicatorVerifications' FROM "contributorReplicatorVerifications" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'copyBlocks' FROM "copyBlocks" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'effectIndexArchive' FROM "effectIndexArchive" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'effectIndexArticles' FROM "effectIndexArticles" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'generatedPublicationOperations' FROM "generatedPublicationOperations" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'indexLayouts' FROM "indexLayouts" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'inviteCodes' FROM "inviteCodes" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'mailingListSubscribers' FROM "mailingListSubscribers" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'memberships' FROM "memberships" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'moleculeClassTemplates' FROM "moleculeClassTemplates" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'moleculeOverrides' FROM "moleculeOverrides" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'narrativeRevisions' FROM "narrativeRevisions" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'prompts' FROM "prompts" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'publicCachePublications' FROM "publicCachePublications" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'publicReadIndexState' FROM "publicReadIndexState" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'quotes' FROM "quotes" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'reagentTests' FROM "reagentTests" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'replicationArtistTaxonomy' FROM "replicationArtistTaxonomy" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'replicationDateResearch' FROM "replicationDateResearch" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'replicationDuplicateReconciliations' FROM "replicationDuplicateReconciliations" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'replicationEditReceipts' FROM "replicationEditReceipts" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'replicationGalleryCandidates' FROM "replicationGalleryCandidates" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'replicationIdentityAttributions' FROM "replicationIdentityAttributions" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'replicationIdentityProfileBindings' FROM "replicationIdentityProfileBindings" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'replicationIdentitySocialOperationItems' FROM "replicationIdentitySocialOperationItems" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'replicationIdentitySocialOperations' FROM "replicationIdentitySocialOperations" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'replicationPlaylists' FROM "replicationPlaylists" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'replications' FROM "replications" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'replicationSocialAssets' FROM "replicationSocialAssets" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'replicationSourceAttribution' FROM "replicationSourceAttribution" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'replicationTaxonomyEvidence' FROM "replicationTaxonomyEvidence" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'reviewedArticles' FROM "reviewedArticles" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'siteConfig' FROM "siteConfig" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'siteFeedback' FROM "siteFeedback" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'subjectiveEffects' FROM "subjectiveEffects" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'substanceGalleries' FROM "substanceGalleries" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'substanceIndex' FROM "substanceIndex" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'tripReports' FROM "tripReports" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'tripReportSubmissions' FROM "tripReportSubmissions" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'tripReportSubstances' FROM "tripReportSubstances" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'warningBannerPresets' FROM "warningBannerPresets" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "documentIds" ("_id", "table") SELECT "_id", 'warningBannerRevisions' FROM "warningBannerRevisions" ON CONFLICT DO NOTHING;
