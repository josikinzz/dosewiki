/**
 * The server side of the correction glossary check: which glossary rows a
 * sentence mentions, and whether a saved correction keeps the approved ones.
 */
import "server-only";
import { readGlossaryReviewRows } from "./glossaryReview";
import { findGlossaryConflicts, mentionedTerms, type GlossaryMention } from "./glossaryConflicts";
import { GlossaryConflictError } from "./reviewStore";

/** Every glossary row for the locale as the editor sees it: the approved rendering when there is one, else the draft. */
export async function readGlossaryMentionIndex(locale: string): Promise<GlossaryMention[]> {
  const rows = await readGlossaryReviewRows(locale);
  return rows.map((row) => ({ term: row.term, target: row.approved_target ?? row.target, approved: row.approved_target !== null, revision: row.revision }));
}

/** The glossary rows one English text mentions, through the shared matcher. */
export function glossaryMentionsFor(source: string, index: readonly GlossaryMention[]): GlossaryMention[] {
  return mentionedTerms(source, index);
}

/**
 * Throws `GlossaryConflictError` naming every approved term the English
 * mentions and the correction drops, unless the reviewer listed it in
 * `exceptions`. Returns the exceptions that applied, for review history.
 */
export async function assertCorrectionKeepsGlossary(locale: string, source: string, target: string, exceptions: readonly string[] = []): Promise<string[]> {
  const approved = (await readGlossaryMentionIndex(locale)).filter((row) => row.approved);
  const conflicts = findGlossaryConflicts(source, target, approved);
  const excused = new Set(exceptions);
  const remaining = conflicts.filter((row) => !excused.has(row.term));
  if (remaining.length) throw new GlossaryConflictError(remaining.map(({ term, target: rendering }) => ({ term, target: rendering })));
  return conflicts.map((row) => row.term);
}
