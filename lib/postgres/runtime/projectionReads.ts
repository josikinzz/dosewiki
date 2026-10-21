import type { Doc } from "./dataModel";

export type PublicOverviewCounts = {
  substanceCount: number;
  effectCount: number;
  reportCount: number;
  replicationCount: number;
  aboutConfigured: boolean;
  psychoactiveCategoryCount: number;
};

export type MoleculePickerPage = {
  page: Array<{ article: Doc<"substanceIndex">; hasOverride: boolean }>;
  continueCursor: string;
  isDone: boolean;
};

export interface SubstanceProjectionReads {
  getAboutAggregateSubstanceRows(): Promise<Doc<"substanceIndex">[]>;
}

export interface PublicProjectionReads extends SubstanceProjectionReads {
  getPublicCopyBlocksByKeys(keys: readonly string[]): Promise<Doc<"copyBlocks">[]>;
  getPublicOverviewCounts(): Promise<PublicOverviewCounts>;
}

export interface EditorialProjectionReads extends PublicProjectionReads {
  getMoleculePickerPage(args: { numItems: number; cursor: string | null }): Promise<MoleculePickerPage>;
  getMoleculeSourceBySlug(slug: string): Promise<Doc<"substanceIndex"> | null>;
  getMoleculeEditSourceBySlug(slug: string): Promise<Doc<"moleculeOverrides"> | null>;
}
