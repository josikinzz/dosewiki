/**
 * Translator's notes: locale-only text under one section of a substance
 * article. Stored in the review tables under scope `note` with the same Save
 * draft, Approve, and Restore history as corrections. Only the article
 * reader, its route, and the localized article render path read this scope;
 * the translation pipeline never does, so a note never reaches a prompt or
 * another locale. A note whose section is gone from the English is orphaned:
 * hidden from readers and listed in the Review Inbox.
 */
import "server-only";
import { getPostgresClient } from "@server/postgres/runtime/backend";
import type { PublicDataReadAdapter } from "../data/publicData.reads";
import { resolveLocale } from "../../scripts/translation/locales.mjs";
import { BLOCKING_DEFECTS, DEFECT_CODES, hasChinese, validateSegment } from "../../scripts/translation/validate.mjs";
import { SUBSTANCE_SECTION_MANIFEST } from "../../src/schema/substance/sectionManifest";
import type { SubstanceArticle } from "../../src/schema/substance/article";
import { readTranslationRecord, segmentsOf } from "./liveTranslation";
import { narrativeIdentity } from "./narrativeIdentity";
import { mutateReviewEntry, readReviewEntries, readReviewHistory, TranslationReviewError } from "./reviewStore";
import type { ReviewAction, ReviewEntry, ReviewSnapshot } from "./reviewTypes";
import {
  TRANSLATOR_NOTE_SECTIONS,
  translatorNoteId,
  type ApprovedTranslatorNotes,
  type TranslatorNotePacket,
  type TranslatorNoteRow,
  type TranslatorNoteSection,
} from "./translatorNoteTypes";

const SECTION_ENTRIES = new Map(SUBSTANCE_SECTION_MANIFEST.map((entry) => [entry.id as string, entry]));

export function translatorNoteSectionLabel(section: TranslatorNoteSection): string {
  return SECTION_ENTRIES.get(section)?.label ?? section;
}

/**
 * Note sections the English article currently renders with content, by the
 * same presence rule as the public table of contents. A record the rule cannot
 * read counts as absent, never as present.
 */
export function presentTranslatorNoteSections(article: object): Set<TranslatorNoteSection> {
  const present = new Set<TranslatorNoteSection>();
  for (const section of TRANSLATOR_NOTE_SECTIONS) {
    const isPresent = SECTION_ENTRIES.get(section)?.public.isPresent;
    try {
      if (isPresent?.(article as SubstanceArticle, {})) present.add(section);
    } catch {
      // A partial record lacks the fields the rule reads, so the section is not there.
    }
  }
  return present;
}

/**
 * Blocking defects in a note body. A note has no English source, so the shared
 * validator runs against an empty source: it still rejects doubled
 * punctuation, script leaks, citation markers, links, and placeholders. A
 * Simplified Chinese note must also be written in Chinese.
 */
export function translatorNoteDefects(body: string, localeCode: string): string[] {
  const locale = resolveLocale(localeCode);
  const defects = validateSegment({ source: "", target: body, locale }).defects.filter((code: string) => BLOCKING_DEFECTS.includes(code));
  if (locale.scriptGate === "simplified" && body.trim() && !hasChinese(body) && !defects.includes(DEFECT_CODES.UNTRANSLATED))
    defects.push(DEFECT_CODES.UNTRANSLATED);
  return defects;
}

function noteContext(slug: string, section: TranslatorNoteSection): string {
  return JSON.stringify({ kind: "article", slug, section });
}

/** The section a stored note belongs to, read from its snapshot. */
export function translatorNoteLocation(entry: ReviewEntry): { slug: string; section: TranslatorNoteSection } | null {
  const snapshot = entry.approved ?? entry.draft;
  try {
    const context: unknown = JSON.parse(snapshot?.context ?? "");
    if (!context || typeof context !== "object") return null;
    const { kind, slug, section } = context as Record<string, unknown>;
    if (kind !== "article" || typeof slug !== "string" || !TRANSLATOR_NOTE_SECTIONS.includes(section as TranslatorNoteSection)) return null;
    return { slug, section: section as TranslatorNoteSection };
  } catch {
    return null;
  }
}

async function sourceArticle(reads: PublicDataReadAdapter, slug: string) {
  const record = await readTranslationRecord(reads, "article", slug);
  if (!record) throw new TranslationReviewError("No public source record exists at this location.", 404);
  const canonicalSlug = "slug" in record && typeof record.slug === "string" ? record.slug : slug;
  return { record, slug: canonicalSlug };
}

/** Every note section of one article for the reader: present sections with their notes, then orphaned notes. */
export async function readTranslatorNotes(reads: PublicDataReadAdapter, locale: string, slug: string): Promise<TranslatorNotePacket> {
  resolveLocale(locale);
  const source = await sourceArticle(reads, slug);
  const present = presentTranslatorNoteSections(source.record);
  const segments = segmentsOf({ ...source.record, slug: source.slug }, "article");
  const entries = new Map((await readReviewEntries(locale, "note")).map((entry) => [entry.sourceId, entry]));
  const sections: TranslatorNoteRow[] = [];
  for (const section of TRANSLATOR_NOTE_SECTIONS) {
    const id = translatorNoteId(source.slug, section), entry = entries.get(id);
    const isPresent = present.has(section);
    const hasNote = Boolean(entry?.draft ?? entry?.approved);
    if (!isPresent && !hasNote) continue;
    const fields = new Set<string>(SECTION_ENTRIES.get(section)?.articleFields ?? []);
    const inSection = isPresent ? segments.filter((segment) => fields.has(segment.group)) : [];
    const last = inSection[inSection.length - 1];
    sections.push({
      section,
      label: translatorNoteSectionLabel(section),
      id,
      present: isPresent,
      afterSegmentId: last ? narrativeIdentity("article", last) : null,
      revision: entry?.revision ?? 0,
      draft: entry?.draft?.target ?? null,
      approved: entry?.approved?.target ?? null,
      status: !isPresent ? "orphaned" : entry?.draft ? "draft" : entry?.approved ? "approved" : "empty",
    });
  }
  return { locale, kind: "article", slug: source.slug, sections: [...sections.filter((row) => row.present), ...sections.filter((row) => !row.present)] };
}

export type TranslatorNoteMutation = {
  locale: string;
  slug: string;
  section: TranslatorNoteSection;
  expectedRevision: number;
  action: ReviewAction;
  body?: string;
  restoreRevision?: number;
  actor: string;
  reason: string;
};

function assertSectionPresent(record: object, section: TranslatorNoteSection) {
  if (!presentTranslatorNoteSections(record).has(section))
    throw new TranslationReviewError("This section is no longer in the English article. The note is orphaned and hidden from readers.", 409);
}

export async function writeTranslatorNote(reads: PublicDataReadAdapter, input: TranslatorNoteMutation) {
  const locale = resolveLocale(input.locale);
  const source = await sourceArticle(reads, input.slug);
  assertSectionPresent(source.record, input.section);
  return mutateReviewEntry({
    locale: input.locale,
    scope: "note",
    sourceId: translatorNoteId(source.slug, input.section),
    expectedRevision: input.expectedRevision,
    action: input.action,
    source: input.section,
    context: noteContext(source.slug, input.section),
    target: input.body,
    restoreRevision: input.restoreRevision,
    actor: input.actor,
    reason: input.reason,
  }, {
    beforeTransition: async () => assertSectionPresent((await sourceArticle(reads, input.slug)).record, input.section),
    onApprove: async (_tx, snapshot) => {
      const defects = translatorNoteDefects(snapshot.target, locale.code);
      if (defects.length) throw new TranslationReviewError(`Note validation failed: ${defects.join(", ")}.`);
    },
  });
}

export async function translatorNoteHistory(locale: string, slug: string, section: TranslatorNoteSection) {
  resolveLocale(locale);
  return readReviewHistory(locale, "note", translatorNoteId(slug, section));
}

/**
 * Approved notes readers see on one localized article: present sections only,
 * so an orphaned note stops rendering. English has no notes and reads nothing.
 */
export async function readApprovedTranslatorNotes(locale: string, slug: string, article: object): Promise<ApprovedTranslatorNotes> {
  if (locale === "en") return {};
  const present = [...presentTranslatorNoteSections(article)];
  if (!present.length) return {};
  const ids = present.map((section) => translatorNoteId(slug, section));
  const rows = await getPostgresClient().sql<{ source_id: string; approved: ReviewSnapshot | null }>(
    'SELECT "source_id","approved" FROM "translationReviewEntries" WHERE "locale"=$1 AND "scope"=\'note\' AND "source_id"=ANY($2::text[]) AND "approved" IS NOT NULL', [locale, ids]);
  // A never-approved entry stores JSON null, which `IS NOT NULL` does not exclude.
  const byId = new Map(rows.map((row) => [row.source_id, row.approved?.target]));
  const notes: ApprovedTranslatorNotes = {};
  for (const section of present) {
    const body = byId.get(translatorNoteId(slug, section));
    if (body?.trim()) notes[section] = body;
  }
  return notes;
}
