export type QuoteSectionId =
  | "summary"
  | "harm_potential"
  | "pharmacology"
  | "history_culture"
  | "dosage_duration"
  | "tolerance"
  | "legality"
  | "subjective_effects";

export type QuoteStorageMode = "data" | "local-file";

export type QuoteSectionDescriptor = {
  id: QuoteSectionId;
  label: string;
  promptKey: string;
  extractionCategory: string;
  aliases: string[];
  storageMode: QuoteStorageMode;
  outputDir: string;
  outputSuffix: string;
  promptFile?: string;
  availability: boolean;
  excludedSources: string[];
};

export const QUOTE_SECTION_IDS: QuoteSectionId[];
export function getQuoteSectionDescriptors(): QuoteSectionDescriptor[];
export function getAvailabilityQuoteSectionIds(): QuoteSectionId[];
export function resolveQuoteSection(section: string): QuoteSectionDescriptor | null;
export function normalizeQuoteSectionId(section: string): QuoteSectionId | null;
export function requireQuoteSection(section: string): QuoteSectionDescriptor;
export function getQuoteSectionById(sectionId: string): QuoteSectionDescriptor | null;
export function getQuoteExtractionCategories(): Record<string, {
  section: QuoteSectionId;
  promptFile: string;
  outputDir: string;
  outputSuffix: string;
  title: string;
  excludedSources: string[];
}>;
export function getLocalQuoteArtifactDescriptors(): Array<{
  path: string;
  section: QuoteSectionId;
  suffix: string;
  storageMode: QuoteStorageMode;
}>;
