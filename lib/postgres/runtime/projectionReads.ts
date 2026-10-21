import type { Doc } from "./dataModel";

type SubstanceColumn = keyof Doc<"substanceIndex">;
type SubstanceRow<Columns extends readonly SubstanceColumn[]> = Pick<Doc<"substanceIndex">, Columns[number]>;
type MoleculeOverrideColumn = keyof Doc<"moleculeOverrides">;

export const aboutAggregateSubstanceColumns = [
  "_id", "_creationTime", "id", "title", "slug", "priority",
  "index_categories", "identification", "classification", "pharmacology",
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

export type MoleculePickerPage = {
  page: Array<{ article: MoleculePickerRow; hasOverride: boolean }>;
  continueCursor: string;
  isDone: boolean;
};

export interface SubstanceProjectionReads {
  getAboutAggregateSubstanceRows(): Promise<AboutAggregateSubstanceRow[]>;
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
