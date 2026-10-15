export type TranslationSegmentSnapshot = { source: string; target: string; model: string; promptVersion: string };
export type TranslationSegmentChange = {
  id: string;
  hash: string;
  before: TranslationSegmentSnapshot | null;
  after: TranslationSegmentSnapshot;
  createdAt: number;
  pages: Array<{ label: string; href: string }>;
  pagesTotal?: number;
};
export type TranslationChangesResponse = { ok: true; locale: string; changes: TranslationSegmentChange[]; nextCursor: string | null };
