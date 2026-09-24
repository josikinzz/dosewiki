/**
 * Browser-safe contracts for translator's notes: short, locale-only text a
 * translator adds under one section of a substance article for local readers.
 * A note is never a translation of English. It lives in the review tables under
 * scope `note`, keyed by locale, article, and section anchor, goes through Save
 * draft and Approve like a correction, and never feeds prompts or other locales.
 */

/** Article body sections that can carry a note, in reading order. Anchors are the public section ids. */
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

/** The review-table source id of one note: one note per locale, article, and section. */
export function translatorNoteId(slug: string, section: TranslatorNoteSection): string {
  return `article/${slug}#${section}`;
}

/**
 * `orphaned`: the section is gone from the English article, so the note is
 * hidden from readers and listed in the Review Inbox.
 */
export type TranslatorNoteStatus = "empty" | "draft" | "approved" | "orphaned";

export type TranslatorNoteRow = {
  section: TranslatorNoteSection;
  /** English section heading, for the reviewer. */
  label: string;
  id: string;
  /** Whether the section is in the current English article. */
  present: boolean;
  /** The last paragraph of the section in the reader, where the note editor sits; null when the section has none. */
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
  /** Every present section, then any orphaned note, in reading order. */
  sections: TranslatorNoteRow[];
};

/** Approved notes readers see, by section. Present sections only. */
export type ApprovedTranslatorNotes = Partial<Record<TranslatorNoteSection, string>>;
