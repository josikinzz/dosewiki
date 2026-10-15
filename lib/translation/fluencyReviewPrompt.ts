import { createHash } from "node:crypto";
import type { TranslationLocale } from "../../scripts/translation/locales.mjs";
import { isBlocking, parseModelJson, validateSegment } from "../../scripts/translation/validate.mjs";
import { findGlossaryConflicts, mentionedTerms } from "./glossaryConflicts";

export const FLUENCY_PROMPT_REVISION = "fluency-1";
export const FLUENCY_APP_TITLE = "dose.wiki fluency review";
export const FLUENCY_CHUNK_CHARS = 8000;
export const MAX_FLUENCY_CHUNKS = 12;
const MAX_SUGGESTIONS_PER_PARAGRAPH = 3;
const MAX_REASON_CHARS = 500;

export type FluencyParagraph = { id: string; field: string; source: string; target: string; markup: boolean };
export type FluencyGlossaryTerm = { term: string; target: string; kind: string };
export type FluencyChunk = { paragraphs: FluencyParagraph[] };

export type FluencyProposal = { paragraphId: string; current: string; suggested: string; reason: string };
export type FluencySuggestion = FluencyProposal & { source: string; before: string; after: string };
export type FluencyDropReason = "malformed" | "not-found" | "unchanged" | "validator" | "glossary" | "limit";
export type FluencyDrops = Record<FluencyDropReason, number>;
export const emptyFluencyDrops = (): FluencyDrops => ({ malformed: 0, "not-found": 0, unchanged: 0, validator: 0, glossary: 0, limit: 0 });

export function fluencySystemPrompt(locale: TranslationLocale, styleGuide?: string): string {
  const script = locale.scriptGate === "simplified" ? "\n- Simplified characters only." : "";
  const guide = styleGuide?.trim() ? `\n\nThe ${locale.label} style guide approved by this locale's translators:\n${styleGuide.trim()}` : "";
  return `You review ${locale.label} translations of dose.wiki, a harm-reduction encyclopedia about psychoactive substances, for fluency.

You read a whole article, English beside the ${locale.label} a reader sees now, and point out only wording that reads unnaturally, awkwardly, or ungrammatically to a native reader. A person reviews every suggestion; nothing is applied automatically.

Rules:
- Suggest local edits only: quote the exact span of the current ${locale.label} wording and give its replacement. Never rewrite a whole paragraph.
- Never change meaning, and never add or remove information. The English is authoritative.
- Never change a number, dose, unit, date, citation marker such as [cite:...], bracket tag, {{placeholder}}, link, or name.
- Keep every approved glossary rendering exactly as listed.
- Leave correct, natural wording alone. An empty list is a good answer.${script}
- Give each reason in one short English sentence.${guide}`;
}

export function fluencyPromptVersion(model: string, systemPrompt: string, glossary: readonly FluencyGlossaryTerm[]): string {
  const terms = [...glossary].sort((a, b) => a.term.localeCompare(b.term)).map(({ term, target, kind }) => [term, target, kind]);
  return createHash("sha256")
    .update(FLUENCY_PROMPT_REVISION).update("\u0000")
    .update(model).update("\u0000")
    .update(systemPrompt).update("\u0000")
    .update(JSON.stringify(terms))
    .digest("hex")
    .slice(0, 16);
}

export function fluencySection(field: string): string {
  return field.split(/[.[]/, 1)[0] ?? field;
}

const size = (paragraph: FluencyParagraph) => paragraph.source.length + paragraph.target.length;

export function chunkFluencyParagraphs(
  paragraphs: readonly FluencyParagraph[],
  budget = FLUENCY_CHUNK_CHARS,
  maxChunks = MAX_FLUENCY_CHUNKS,
): { chunks: FluencyChunk[]; skipped: number } {
  const sections: FluencyParagraph[][] = [];
  for (const paragraph of paragraphs) {
    const last = sections[sections.length - 1];
    if (last && fluencySection(last[0].field) === fluencySection(paragraph.field)) last.push(paragraph);
    else sections.push([paragraph]);
  }
  const chunks: FluencyChunk[] = [];
  let open: FluencyParagraph[] = [];
  let chars = 0;
  const flush = () => { if (open.length) chunks.push({ paragraphs: open }); open = []; chars = 0; };
  for (const section of sections) {
    const sectionChars = section.reduce((sum, paragraph) => sum + size(paragraph), 0);
    if (chars + sectionChars > budget) flush();
    for (const paragraph of section) {
      if (chars > 0 && chars + size(paragraph) > budget) flush();
      open.push(paragraph);
      chars += size(paragraph);
    }
  }
  flush();
  const kept = chunks.slice(0, maxChunks);
  const skipped = chunks.slice(maxChunks).reduce((sum, chunk) => sum + chunk.paragraphs.length, 0);
  return { chunks: kept, skipped };
}

function termsFor(chunk: FluencyChunk, glossary: readonly FluencyGlossaryTerm[]): FluencyGlossaryTerm[] {
  return glossary.filter((entry) => chunk.paragraphs.some((paragraph) => mentionedTerms(paragraph.source, [entry]).length > 0));
}

export function buildFluencyPrompt(locale: TranslationLocale, chunk: FluencyChunk, glossary: readonly FluencyGlossaryTerm[]): string {
  const input = Object.fromEntries(chunk.paragraphs.map((paragraph, index) => [`p${index}`, { field: paragraph.field, en: paragraph.source, current: paragraph.target }]));
  const terms = termsFor(chunk, glossary);
  return [
    `Review the ${locale.label} wording of these paragraphs from one article, in reading order.`,
    ...(terms.length ? ["", "Approved glossary renderings (keep exactly):", ...terms.map(({ term, target }) => `- ${term}: ${target}`)] : []),
    "",
    "Input JSON:",
    JSON.stringify(input, null, 1),
    "",
    'Return ONLY a JSON object: {"suggestions": [{"paragraph": "p0", "current": "exact span of current", "suggested": "replacement", "reason": "one short English sentence"}]}.',
    'Return {"suggestions": []} when every paragraph reads naturally.',
  ].join("\n");
}

export function parseFluencyReply(content: unknown, chunk: FluencyChunk): { proposals: FluencyProposal[]; malformed: number } {
  const parsed = parseModelJson(content);
  const list = parsed.ok ? parsed.value?.suggestions : undefined;
  if (!Array.isArray(list)) return { proposals: [], malformed: parsed.ok ? 0 : 1 };
  const proposals: FluencyProposal[] = [];
  let malformed = 0;
  for (const item of list) {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const match = typeof record.paragraph === "string" ? /^p(\d+)$/.exec(record.paragraph) : null;
    const paragraph = match ? chunk.paragraphs[Number(match[1])] : undefined;
    const { current, suggested, reason } = record;
    if (!paragraph || typeof current !== "string" || !current || typeof suggested !== "string" || typeof reason !== "string" || !reason.trim()) {
      malformed += 1;
      continue;
    }
    proposals.push({ paragraphId: paragraph.id, current, suggested, reason: reason.trim().slice(0, MAX_REASON_CHARS) });
  }
  return { proposals, malformed };
}

export function fluencyGlossaryConflicts(source: string, suggested: string, glossary: readonly FluencyGlossaryTerm[]): string[] {
  return findGlossaryConflicts(source, suggested, glossary).map((entry) => entry.term);
}

function addsNumber(details: Record<string, unknown>, paragraph: FluencyParagraph, locale: TranslationLocale): boolean {
  const added = (value: unknown) => (Array.isArray(value) ? value.map(String).sort() : []);
  const after = added(details.addedNumbers);
  if (!after.length) return false;
  const before = added(validateSegment({ source: paragraph.source, target: paragraph.target, locale, markup: paragraph.markup }).details.addedNumbers);
  return after.join("\u0000") !== before.join("\u0000");
}

export function checkFluencyProposal(
  proposal: FluencyProposal,
  paragraph: FluencyParagraph,
  locale: TranslationLocale,
  glossary: readonly FluencyGlossaryTerm[],
): { ok: true; suggestion: FluencySuggestion } | { ok: false; reason: FluencyDropReason } {
  const at = paragraph.target.indexOf(proposal.current);
  if (at < 0 || paragraph.target.indexOf(proposal.current, at + 1) >= 0) return { ok: false, reason: "not-found" };
  const after = paragraph.target.slice(0, at) + proposal.suggested + paragraph.target.slice(at + proposal.current.length);
  if (after.trim() === paragraph.target.trim()) return { ok: false, reason: "unchanged" };
  const { defects, details } = validateSegment({ source: paragraph.source, target: after, locale, markup: paragraph.markup });
  if (isBlocking(defects) || addsNumber(details, paragraph, locale)) return { ok: false, reason: "validator" };
  if (fluencyGlossaryConflicts(paragraph.source, after, glossary).length) return { ok: false, reason: "glossary" };
  return { ok: true, suggestion: { ...proposal, source: paragraph.source, before: paragraph.target, after } };
}

export function checkFluencyProposals(
  proposals: readonly FluencyProposal[],
  chunk: FluencyChunk,
  locale: TranslationLocale,
  glossary: readonly FluencyGlossaryTerm[],
  drops: FluencyDrops,
): FluencySuggestion[] {
  const byId = new Map(chunk.paragraphs.map((paragraph) => [paragraph.id, paragraph]));
  const kept: FluencySuggestion[] = [];
  const perParagraph = new Map<string, number>();
  for (const proposal of proposals) {
    const paragraph = byId.get(proposal.paragraphId)!;
    const checked = checkFluencyProposal(proposal, paragraph, locale, glossary);
    if (!checked.ok) { drops[checked.reason] += 1; continue; }
    const count = perParagraph.get(paragraph.id) ?? 0;
    if (count >= MAX_SUGGESTIONS_PER_PARAGRAPH) { drops.limit += 1; continue; }
    perParagraph.set(paragraph.id, count + 1);
    kept.push(checked.suggestion);
  }
  return kept;
}
