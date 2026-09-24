/**
 * Does a correction keep the approved glossary? Browser safe, so the editor
 * runs the same check while the reviewer types that the server runs on save.
 *
 * A conflict is an approved term the English mentions (the shared matcher:
 * whole words, English inflections) whose rendering the correction does not
 * contain. It is the validator's GLOSSARY_MISS rule applied to human wording.
 */
import { mentionsTerm, termFragments } from "../../scripts/translation/term-match.mjs";

export type GlossaryRendering = { term: string; target: string };
/** A glossary row the editor can offer: approved rows are checked, draft rows can still be proposed. */
export type GlossaryMention = GlossaryRendering & { approved: boolean; revision: string };

/** Terms from `terms` that `source` mentions, in the order given. */
export function mentionedTerms<T extends { term: string }>(source: string, terms: readonly T[]): T[] {
  const folded = source.toLowerCase();
  // The fragment prefilter never drops a text the matcher would accept; it only skips the regex.
  return terms.filter((entry) => termFragments(entry.term).every((fragment) => folded.includes(fragment.toLowerCase())) && mentionsTerm(source, entry.term));
}

/** Approved renderings the English mentions and the correction leaves out, minus the reviewer's exceptions. */
export function findGlossaryConflicts<T extends GlossaryRendering>(source: string, target: string, approved: readonly T[], exceptions: readonly string[] = []): T[] {
  const excused = new Set(exceptions);
  return mentionedTerms(source, approved).filter((entry) => entry.target.trim() && !target.includes(entry.target) && !excused.has(entry.term));
}

/** The sentence the editor shows and the server returns for one conflict. */
export function glossaryConflictMessage(conflict: GlossaryRendering): string {
  return `This sentence mentions ${conflict.term} (${conflict.target}). Your wording does not use it.`;
}
