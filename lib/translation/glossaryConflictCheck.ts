import "server-only";
import { readGlossaryReviewRows } from "./glossaryReview";
import { findGlossaryConflicts, mentionedTerms, type GlossaryMention } from "./glossaryConflicts";
import { GlossaryConflictError } from "./reviewStore";

export async function readGlossaryMentionIndex(locale: string): Promise<GlossaryMention[]> {
  const rows = await readGlossaryReviewRows(locale);
  return rows.map((row) => ({ term: row.term, target: row.approved_target ?? row.target, approved: row.approved_target !== null, revision: row.revision }));
}

export function glossaryMentionsFor(source: string, index: readonly GlossaryMention[]): GlossaryMention[] {
  return mentionedTerms(source, index);
}

export async function assertCorrectionKeepsGlossary(locale: string, source: string, target: string, exceptions: readonly string[] = []): Promise<string[]> {
  return assertKeepsGlossaryIn(await readGlossaryMentionIndex(locale), source, target, exceptions);
}

export function assertKeepsGlossaryIn(index: readonly GlossaryMention[], source: string, target: string, exceptions: readonly string[] = []): string[] {
  const approved = index.filter((row) => row.approved);
  const conflicts = findGlossaryConflicts(source, target, approved);
  const excused = new Set(exceptions);
  const remaining = conflicts.filter((row) => !excused.has(row.term));
  if (remaining.length) throw new GlossaryConflictError(remaining.map(({ term, target: rendering }) => ({ term, target: rendering })));
  return conflicts.map((row) => row.term);
}
