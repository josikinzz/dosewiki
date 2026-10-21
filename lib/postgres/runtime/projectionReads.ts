import type { CitationQueueSummary } from "../../../server/lib/citationQueueFilter";
import type { Doc, TableNames } from "./dataModel";
import type { Doc as StoredDocument } from "./dbRows";
import type { FeedbackQueuePageOptions, FeedbackQueueStatusCounts, FeedbackQueueTable } from "./feedbackQueuePage";

type Column<Table extends TableNames> = keyof Doc<Table>;
type ProjectedRow<Table extends TableNames, Columns extends readonly Column<Table>[]> = Pick<Doc<Table>, Columns[number]>;
type SubstanceColumn = Column<"substanceIndex">;
type SubstanceRow<Columns extends readonly SubstanceColumn[]> = ProjectedRow<"substanceIndex", Columns>;
type MoleculeOverrideColumn = Column<"moleculeOverrides">;

export const aboutAggregateSubstanceColumns = [
  "_id", "_creationTime", "id", "title", "slug", "priority",
  "index_categories", "identification", "classification", "pharmacology",
] as const satisfies readonly SubstanceColumn[];

export const publicSubstanceMechanismColumns = [
  "_id", "_creationTime", "title", "slug", "priority",
  "index_categories", "identification", "pharmacology",
] as const satisfies readonly SubstanceColumn[];

export const publicSubstanceLookupColumns = ["title", "slug", "priority"] as const satisfies readonly SubstanceColumn[];

export const publicSubstancePreviewColumns = [
  "title", "slug", "summary", "priority", "index_categories",
] as const satisfies readonly SubstanceColumn[];

export const publicSubstanceSlugColumns = ["title", "slug"] as const satisfies readonly SubstanceColumn[];

export const publicSubstanceSlugCandidateColumns = [
  "_id", "_creationTime", "title", "slug",
] as const satisfies readonly SubstanceColumn[];

export const publicSubstanceEffectMembershipColumns = [
  "_id", "_creationTime", "id", "title", "slug", "priority",
  "index_categories", "identification", "classification", "subjective_effects",
] as const satisfies readonly SubstanceColumn[];

export const publicSubstanceLibraryInputColumns = [
  "_id", "_creationTime", "id", "title", "slug", "priority",
  "index_categories", "identification", "classification", "summary",
  "dosage", "duration", "subjective_effects", "pharmacology", "interactions",
  "reagent_testing", "tolerance", "references", "source_citations", "citations",
] as const satisfies readonly SubstanceColumn[];

export const publicSubstanceLibraryInputNarrowedColumns = [
  "harm_potential", "editorial_review",
] as const satisfies readonly SubstanceColumn[];

export const publicSubstanceCoverageColumns = [
  "_id", "_creationTime", "title", "slug", "priority", "index_categories",
  "dosage", "duration", "subjective_effects", "pharmacology", "interactions",
  "tolerance", "harm_potential", "history_culture", "legality",
  "references", "source_citations", "citations", "editorial_review",
] as const satisfies readonly SubstanceColumn[];

export const moleculePickerColumns = [
  "_id", "_creationTime", "slug", "title", "priority", "index_categories", "classification",
] as const satisfies readonly SubstanceColumn[];

export const moleculeSourceColumns = [
  "_id", "_creationTime", "slug", "title", "identification",
] as const satisfies readonly SubstanceColumn[];

export const moleculeEditSourceColumns = [
  "_id", "_creationTime", "slug", "molblock", "boldBonds", "source", "updatedAt",
] as const satisfies readonly MoleculeOverrideColumn[];

export const editorLibraryColumns = [
  "_id", "_creationTime", "id", "slug", "title", "priority", "index_categories",
  "identification", "classification", "pharmacology", "subjective_effects", "editorial_review",
] as const satisfies readonly SubstanceColumn[];

export const publicEffectProjectionColumns = {
  preview: ["_id", "_creationTime", "slug", "name", "tags", "featured", "summary"],
  index: ["_id", "_creationTime", "slug", "name", "tags", "featured"],
  summary: ["_id", "_creationTime", "slug", "name", "long_summary_raw", "long_summary_ast", "citations", "subarticles"],
  slugs: ["_id", "_creationTime", "slug", "name"],
  audio: ["_id", "_creationTime", "slug", "name", "audio_replications"],
  credits: ["_id", "_creationTime", "slug", "name", "contributors"],
} as const satisfies Record<string, readonly Column<"subjectiveEffects">[]>;

export const publicEffectGalleryOrderColumns = [
  "_id", "_creationTime", "slug", "gallery_order",
] as const satisfies readonly Column<"subjectiveEffects">[];

export const publicContributorIdentityColumns = [
  "_id", "_creationTime", "key", "displayName", "aliases", "avatarUrl", "avatarR2Key",
  "avatarStorageId", "exclude_from_gallery", "approved_replicator", "archival",
] as const satisfies readonly Column<"contributorProfiles">[];

export const publicTripReportPreviewColumns = [
  "_id", "_creationTime", "slug", "title", "featured", "subject",
  "substances", "attribution_review",
] as const satisfies readonly Column<"tripReports">[];

export const publicTripReportContributorColumns = [
  "_id", "_creationTime", "slug", "title", "featured", "subject", "substances", "introduction",
  "onset", "peak", "offset", "conclusion", "tags", "license", "attribution_review",
] as const satisfies readonly Column<"tripReports">[];

export const publicGalleryMembershipColumns = [
  "_id", "_creationTime", "slug", "title", "artist", "artist_url",
  "type", "format", "effect_slug", "effect_tags", "viewing_mode_tags",
  "title_drugs", "drug_classes", "content_family", "storage_id", "r2_key",
  "url", "has_audio", "created_at", "date_info", "role",
  "publication_state", "replication_status",
] as const satisfies readonly Column<"replications">[];

export const publishedArticleIndexColumns = [
  "slug", "title", "tags", "publication_status", "featured", "shortDescription",
  "publicationDate", "kind", "bodyFormat", "authors",
] as const satisfies readonly Column<"effectIndexArticles">[];

export const publishedBlogIndexColumns = [
  "slug", "title", "publication_status", "publicationDate", "kind", "teaser", "coverImageUrl",
] as const satisfies readonly Column<"effectIndexArticles">[];

export const publicArtistCreditColumns = [
  "_id", "_creationTime", "artist", "artist_url", "effect_slug", "storage_id", "r2_key", "url",
] as const satisfies readonly Column<"replications">[];

export type AboutAggregateSubstanceRow = SubstanceRow<typeof aboutAggregateSubstanceColumns>;
export type PublicSubstanceMechanismRow = SubstanceRow<typeof publicSubstanceMechanismColumns>;
export type PublicSubstanceLookupRow = SubstanceRow<typeof publicSubstanceLookupColumns>;
export type PublicSubstancePreviewRow = SubstanceRow<typeof publicSubstancePreviewColumns>;
export type PublicSubstanceSlugRow = SubstanceRow<typeof publicSubstanceSlugColumns>;
export type PublicSubstanceSlugCandidateRow = SubstanceRow<typeof publicSubstanceSlugCandidateColumns>;
export type PublicSubstanceEffectMembershipRow = SubstanceRow<typeof publicSubstanceEffectMembershipColumns>;
export type PublicSubstanceLibraryInputRow = SubstanceRow<
  typeof publicSubstanceLibraryInputColumns | typeof publicSubstanceLibraryInputNarrowedColumns
>;
export type PublicSubstanceCoverageRow = SubstanceRow<typeof publicSubstanceCoverageColumns>;
export type MoleculePickerRow = SubstanceRow<typeof moleculePickerColumns>;
export type MoleculeSourceRow = SubstanceRow<typeof moleculeSourceColumns>;
export type MoleculeEditSourceRow = ProjectedRow<"moleculeOverrides", typeof moleculeEditSourceColumns>;
export type EditorLibraryArticleRow = SubstanceRow<typeof editorLibraryColumns>;
export type PublicEffectProjection = keyof typeof publicEffectProjectionColumns;
export type PublicEffectProjectionRow<Projection extends PublicEffectProjection> =
  ProjectedRow<"subjectiveEffects", (typeof publicEffectProjectionColumns)[Projection]>;
export type PublicEffectGalleryOrderRow = ProjectedRow<"subjectiveEffects", typeof publicEffectGalleryOrderColumns>;
export type PublicContributorIdentityRow = ProjectedRow<"contributorProfiles", typeof publicContributorIdentityColumns>;
export type PublicTripReportPreviewRow = ProjectedRow<"tripReports", typeof publicTripReportPreviewColumns>;
export type PublicTripReportBrowseRow = PublicTripReportPreviewRow & { excerpt_source: string | null };
export type PublicTripReportContributorRow = ProjectedRow<"tripReports", typeof publicTripReportContributorColumns>;
export type PublicGalleryMembershipRow = ProjectedRow<"replications", typeof publicGalleryMembershipColumns>;
export type PublicArtistCreditRow = ProjectedRow<"replications", typeof publicArtistCreditColumns>;
export type PublicArtistTaxonomyRow = { key: string; primary_type: unknown; artist_type_tags: unknown };
export type PublishedArticleIndexRow = ProjectedRow<"effectIndexArticles", typeof publishedArticleIndexColumns> & {
  description_source: string | null;
  readMinutes: number | null;
};
export type PublishedBlogIndexRow = ProjectedRow<"effectIndexArticles", typeof publishedBlogIndexColumns> & {
  excerpt_source: string | null;
};

export type PublicOverviewCounts = {
  substanceCount: number;
  effectCount: number;
  reportCount: number;
  replicationCount: number;
  aboutConfigured: boolean;
  psychoactiveCategoryCount: number;
};

export type PublicSubstancePage<Row> = {
  rows: Row[];
  cursor: string;
  isDone: boolean;
};

export type MoleculePickerPage = {
  page: Array<{ article: MoleculePickerRow; hasOverride: boolean }>;
  continueCursor: string;
  isDone: boolean;
};

export type EditorLibraryPage = {
  page: Array<{ article: EditorLibraryArticleRow; referenceCount: number }>;
  continueCursor: string;
  isDone: boolean;
};

export type PublicEffectReplicationPage = {
  page: Doc<"replications">[];
  continueCursor: string;
  isDone: boolean;
};

export type ReviewRecommendationRow = {
  slug: string;
  title: string;
  status: string | null;
  reviewedRevision: string | null;
  recommendation: unknown;
};

export type CitationEvidenceReviewRow = Record<string, unknown> & {
  section?: string;
  claimKey?: string;
  fieldPath?: string;
};

export type ReplicationPlaylistSummaryRow = {
  key: string;
  title: string;
  work_count: number;
  updated_at: string;
  updated_by: string | null;
  owner_email: string | null;
};

export interface SubstanceProjectionReads {
  getAboutAggregateSubstanceRows(): Promise<AboutAggregateSubstanceRow[]>;
  getPublicAboutPreviewRows(limit: number): Promise<Doc<"substanceIndex">[]>;
  getPublicSubstanceMechanismRows(): Promise<PublicSubstanceMechanismRow[]>;
  getPublicSubstanceLookupPage(cursor: string | undefined, limit: number): Promise<PublicSubstancePage<PublicSubstanceLookupRow>>;
  getPublicSubstancePreviewsPage(cursor: string | undefined, limit: number): Promise<PublicSubstancePage<PublicSubstancePreviewRow>>;
  getPublicSubstanceSlugsPage(cursor: string | undefined, limit: number): Promise<PublicSubstancePage<PublicSubstanceSlugRow>>;
  getPublicSubstanceSlugsByCandidates(candidates: readonly string[]): Promise<PublicSubstanceSlugCandidateRow[]>;
  getPublicSubstanceEffectMembershipPage(
    cursor: string | undefined,
    limit: number,
  ): Promise<PublicSubstancePage<PublicSubstanceEffectMembershipRow>>;
  getPublicSubstanceLibraryInputPage(
    cursor: string | undefined,
    limit: number,
  ): Promise<PublicSubstancePage<PublicSubstanceLibraryInputRow>>;
  getPublicSubstanceCoveragePage(cursor: string | undefined, limit: number): Promise<PublicSubstancePage<PublicSubstanceCoverageRow>>;
}

export interface PublicProjectionReads extends SubstanceProjectionReads {
  getPublicCopyBlocksByKeys(keys: readonly string[]): Promise<Doc<"copyBlocks">[]>;
  getPublicOverviewCounts(): Promise<PublicOverviewCounts>;
  getPublicArtistTaxonomyByKeys(keys: readonly string[]): Promise<PublicArtistTaxonomyRow[]>;
  getPublicContributorIdentities(lookupKeys?: readonly string[]): Promise<PublicContributorIdentityRow[]>;
  getPublicEffectProjection<Projection extends PublicEffectProjection>(
    projection: Projection,
    slugs?: readonly string[],
  ): Promise<PublicEffectProjectionRow<Projection>[]>;
  getPublicEffectCreditsByNames(names: readonly string[]): Promise<PublicEffectProjectionRow<"credits">[]>;
  getPublicEffectGalleryOrders(slugs: readonly string[]): Promise<PublicEffectGalleryOrderRow[]>;
  getPublicTripReportBrowseRows(excerptSourceLength: number): Promise<PublicTripReportBrowseRow[]>;
  getPublicTripReportPreviewsBySubstanceNames(names: readonly string[]): Promise<PublicTripReportPreviewRow[]>;
  getPublicTripReportsByContributor(profileKey: string, authorNames: readonly string[]): Promise<PublicTripReportContributorRow[]>;
  getPublicGalleryMembershipRows(): Promise<PublicGalleryMembershipRow[]>;
  getPublicArtistCreditRows(): Promise<PublicArtistCreditRow[]>;
  getReplicationsBySlugs(slugs: readonly string[]): Promise<Doc<"replications">[]>;
  getPublicEffectReplicationPage(args: { effectSlug: string; cursor?: string; limit: number }): Promise<PublicEffectReplicationPage>;
  getPublishedArticleIndex(): Promise<PublishedArticleIndexRow[]>;
  getPublishedBlogIndex(): Promise<PublishedBlogIndexRow[]>;
}

export interface EditorialProjectionReads extends PublicProjectionReads {
  getMoleculePickerPage(args: { numItems: number; cursor: string | null }): Promise<MoleculePickerPage>;
  getMoleculeSourceBySlug(slug: string): Promise<MoleculeSourceRow | null>;
  getMoleculeEditSourceBySlug(slug: string): Promise<MoleculeEditSourceRow | null>;
  getEditorLibraryPage(args: { numItems: number; cursor: string | null }): Promise<EditorLibraryPage>;
  getStudioReplicationTotal(): Promise<number>;
  getPublishedArticleRevisions(): Promise<Array<{ slug: string; revision: string }>>;
  getReviewRecommendationRows(): Promise<ReviewRecommendationRow[]>;
  getFeedbackQueuePage(
    table: FeedbackQueueTable,
    options: FeedbackQueuePageOptions,
  ): Promise<{ rows: StoredDocument[]; nextCursor: string | null }>;
  getFeedbackQueueCounts(table: FeedbackQueueTable, search: string | undefined): Promise<FeedbackQueueStatusCounts>;
  getFeedbackCountByStatuses(table: FeedbackQueueTable, statuses: readonly string[]): Promise<number>;
  getCitationEvidenceReviewRows(slug: string): Promise<CitationEvidenceReviewRow[]>;
  getCitationQueueSummaries(): Promise<CitationQueueSummary[]>;
  getReplicationPlaylistSummaryRows(ownerEmail?: string): Promise<ReplicationPlaylistSummaryRow[]>;
}
