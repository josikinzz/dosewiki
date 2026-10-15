export const TRANSLATOR_NOTE_SECTIONS = [
  "dosage-duration",
  "subjective-effects",
  "reagent-testing",
  "pharmacology",
  "interactions",
  "tolerance",
  "harm-potential",
  "history-culture",
  "legality",
] as const;

export type TranslatorNoteSection = (typeof TRANSLATOR_NOTE_SECTIONS)[number];

export function isTranslatorNoteSection(value: unknown): value is TranslatorNoteSection {
  return typeof value === "string" && (TRANSLATOR_NOTE_SECTIONS as readonly string[]).includes(value);
}

export const TRANSLATOR_NOTE_MAX_LENGTH = 2000;

export function translatorNoteId(slug: string, section: TranslatorNoteSection): string {
  return `article/${slug}#${section}`;
}

export type TranslatorNoteStatus = "empty" | "draft" | "approved" | "orphaned";

export type TranslatorNoteRow = {
  section: TranslatorNoteSection;
  label: string;
  id: string;
  present: boolean;
  afterSegmentId: string | null;
  revision: number;
  draft: string | null;
  approved: string | null;
  status: TranslatorNoteStatus;
};

export type TranslatorNotePacket = {
  locale: string;
  kind: "article";
  slug: string;
  sections: TranslatorNoteRow[];
};

export type ApprovedTranslatorNotes = Partial<Record<TranslatorNoteSection, string>>;
