import { mentionsTerm, termFragments } from "../../scripts/translation/term-match.mjs";

export type GlossaryRendering = { term: string; target: string };
export type GlossaryMention = GlossaryRendering & { approved: boolean; revision: string };

export function mentionedTerms<T extends { term: string }>(source: string, terms: readonly T[]): T[] {
  const folded = source.toLowerCase();
  return terms.filter((entry) => termFragments(entry.term).every((fragment) => folded.includes(fragment.toLowerCase())) && mentionsTerm(source, entry.term));
}

export function findGlossaryConflicts<T extends GlossaryRendering>(source: string, target: string, approved: readonly T[], exceptions: readonly string[] = []): T[] {
  const excused = new Set(exceptions);
  return mentionedTerms(source, approved).filter((entry) => entry.target.trim() && !target.includes(entry.target) && !excused.has(entry.term));
}

export function glossaryConflictMessage(conflict: GlossaryRendering): string {
  return `This sentence mentions ${conflict.term} (${conflict.target}). Your wording does not use it.`;
}
