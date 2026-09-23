/** Automatic translation changes are generation evidence, not human approval. */
export type TranslationSegmentSnapshot = { source: string; target: string; model: string; promptVersion: string };
export type TranslationSegmentChange = {
  id: string;
  hash: string;
  before: TranslationSegmentSnapshot | null;
  after: TranslationSegmentSnapshot;
  createdAt: number;
  pages: Array<{ label: string; href: string }>;
  /** Total current usages; the API bounds the rendered link list. */
  pagesTotal?: number;
};
export type TranslationChangesResponse = { ok: true; locale: string; changes: TranslationSegmentChange[]; nextCursor: string | null };
