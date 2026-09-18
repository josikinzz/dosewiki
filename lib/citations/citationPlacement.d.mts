export type CitationPlacementSection = {
  key: string;
  legacyKey: string;
  severity: "blocking" | "non_blocking";
};

export type CitationPlacementTarget = {
  sectionKey: string;
  claimKey: string;
  fieldPath: string;
  claimText: string;
  mergeMode: "inline_text" | "structured_reference_ids";
  collectionPath?: string;
  route?: string;
};

export type WorkbenchCitationPlacement = {
  claimKey: string;
  section: string;
  severity: "blocking" | "non_blocking";
  mergeMode: string;
  fieldPaths: string[];
};

export type CitationToken = {
  id: string;
  index: number;
  raw: string;
};

export const CITATION_PLACEMENT_SECTIONS: readonly CitationPlacementSection[];
export function normalizeCitationPlacementSectionKey(value: unknown): string | null;
export function getCitationPlacementSection(sectionKey: unknown): CitationPlacementSection;
export function getWorkbenchCitationPlacement(claimKey: unknown): WorkbenchCitationPlacement | null;
export function getWorkbenchCitationSection(input?: { claimKey?: unknown; fieldPath?: string | null }): string;
export function getWorkbenchCitationSeverity(claimKey: unknown): "blocking" | "non_blocking";
export function applyWorkbenchCitationPlacement(article: Record<string, unknown>, changes: unknown[], evidence: Record<string, unknown>): boolean;
export function buildCitationPlacementTargets(input: { article: unknown; sectionKey: string }): CitationPlacementTarget[];
export function extractCitationTokens(text: unknown): CitationToken[];
export function collectCitationIdsFromPublicRenderOrder(article: unknown): string[];
