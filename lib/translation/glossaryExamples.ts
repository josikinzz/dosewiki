import "server-only";

import { stripMarkup } from "../../scripts/translation/markup.mjs";
import { termMatcher } from "../../scripts/translation/term-match.mjs";
import type { GlossaryExample } from "../../src/features/language-glossary/languageGlossary";
import { getPostgresClient } from "../postgres/runtime/backend";
import { getGlossaryExampleCandidates, type GlossaryExampleCandidate } from "./glossaryUsage";

const ENGLISH_RADIUS = 60;
const ELLIPSIS = "…";

const readable = (text: string) => stripMarkup(text).replace(/\s+/g, " ").trim();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function trimAround(text: string, start: number, end: number, radius: number): string {
  let from = Math.max(0, start - radius);
  let to = Math.min(text.length, end + radius);
  if (from > 0 && text[from - 1] !== " ") {
    const space = text.indexOf(" ", from);
    if (space !== -1 && space < start) from = space + 1;
  }
  if (to < text.length) {
    const space = text.lastIndexOf(" ", to);
    if (space >= end) to = space;
  }
  return `${from > 0 ? ELLIPSIS : ""}${text.slice(from, to).trim()}${to < text.length ? ELLIPSIS : ""}`;
}

export function buildGlossaryExample(
  entry: { term: string; target: string | null },
  candidates: readonly GlossaryExampleCandidate[],
  translations: ReadonlyMap<string, string>,
): GlossaryExample | null {
  for (const candidate of candidates) {
    const stored = translations.get(candidate.hash);
    if (!stored?.trim()) continue;
    const english = readable(candidate.english);
    const match = termMatcher(entry.term).exec(english);
    if (!match) continue;
    const translated = readable(stored);
    const rendering = entry.target
      ? new RegExp(escape(entry.target), "iu").exec(translated)
      : null;
    const at = rendering
      ? rendering.index
      : Math.round((match.index / Math.max(1, english.length)) * translated.length);
    const radius = Math.max(12, Math.round((ENGLISH_RADIUS * translated.length) / Math.max(1, english.length)));
    return {
      english: trimAround(english, match.index, match.index + match[0].length, ENGLISH_RADIUS),
      target: trimAround(translated, at, at + (rendering?.[0].length ?? 0), radius),
      href: candidate.href,
    };
  }
  return null;
}

export async function readGlossaryExamples(
  locale: string,
  entries: readonly { term: string; target: string | null }[],
): Promise<Map<string, GlossaryExample>> {
  const candidates = await getGlossaryExampleCandidates(entries.map((entry) => entry.term));
  const hashes = [...new Set(Object.values(candidates).flat().map((candidate) => candidate.hash))];
  const rows = hashes.length
    ? await getPostgresClient().sql<{ hash: string; target: string }>(
        'SELECT "hash", "target" FROM "translationSegments" WHERE "locale" = $1 AND "hash" = ANY($2::text[])',
        [locale, hashes],
      )
    : [];
  const translations = new Map(rows.map((row) => [row.hash, row.target]));
  const examples = new Map<string, GlossaryExample>();
  for (const entry of entries) {
    const example = buildGlossaryExample(entry, candidates[entry.term] ?? [], translations);
    if (example) examples.set(entry.term, example);
  }
  return examples;
}
