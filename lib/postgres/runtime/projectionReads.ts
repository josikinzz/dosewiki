import type { Doc } from "./dataModel";

type SubstanceColumn = keyof Doc<"substanceIndex">;
type SubstanceRow<Columns extends readonly SubstanceColumn[]> = Pick<Doc<"substanceIndex">, Columns[number]>;
type MoleculeOverrideColumn = keyof Doc<"moleculeOverrides">;

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
export type MoleculeEditSourceRow = Pick<Doc<"moleculeOverrides">, (typeof moleculeEditSourceColumns)[number]>;

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

export interface SubstanceProjectionReads {
  getAboutAggregateSubstanceRows(): Promise<AboutAggregateSubstanceRow[]>;
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
}

export interface EditorialProjectionReads extends PublicProjectionReads {
  getMoleculePickerPage(args: { numItems: number; cursor: string | null }): Promise<MoleculePickerPage>;
  getMoleculeSourceBySlug(slug: string): Promise<MoleculeSourceRow | null>;
  getMoleculeEditSourceBySlug(slug: string): Promise<MoleculeEditSourceRow | null>;
}
