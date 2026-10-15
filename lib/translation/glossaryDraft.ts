import "server-only";

import { callOpenRouterChat } from "../../scripts/lib/openrouter-sdk.mjs";
import { DEFAULT_MODEL } from "../../scripts/translation/engine.mjs";
import { resolveLocale, type TranslationLocale } from "../../scripts/translation/locales.mjs";
import { isBlocking, parseModelJson, validateSegment } from "../../scripts/translation/validate.mjs";
import type { PublicDataReadAdapter } from "../data/publicData.reads";
import { readGlossaryRows, upsertGlossaryRows, type GlossaryDraft } from "./glossary";
import { collectGlossaryTerms, type GlossaryTerm } from "./glossaryTerms";
export { collectGlossaryTerms, type GlossaryTerm } from "./glossaryTerms";

function systemPromptFor(locale: TranslationLocale): string {
  const script = locale.scriptGate === "simplified" ? "\n2. Simplified characters only. Never a Traditional form." : "";
  return `You are compiling a ${locale.label} terminology list for dose.wiki, a harm-reduction encyclopedia about psychoactive substances.

Each input is a term as it appears on the site: an effect name, category or subcategory, a drug class or one of its aliases, a frequency label, a badge label, a harm-reduction word, a replication or gallery term, a site or index name, an article section heading, a route of administration, or a reagent name. Give the ${locale.label} term a reader in this field would use.

Rules:
1. Return the term only. No explanation, no parenthetical gloss, no English echo.${script}
3. Keep Latin-script proper nouns and chemical names in Latin script.
4. Prefer the standard clinical or scientific term where one exists.
5. Two different English terms must not receive the same rendering. If two inputs are near-synonyms, render the distinction the English draws.
6. Numbers and units are copied exactly.`;
}

type ModelCall = { locale: TranslationLocale; apiKey: string; appTitle: string; userMessage: string; maxTokens: number };

async function askModel({ locale, apiKey, appTitle, userMessage, maxTokens }: ModelCall) {
  return callOpenRouterChat({
    apiKey,
    appTitle,
    model: DEFAULT_MODEL,
    systemPrompt: systemPromptFor(locale),
    userMessage,
    temperature: 0,
    maxTokens,
    reasoningEffort: "low",
    excludeReasoning: true,
  });
}

async function translateTermBatch(entries: readonly GlossaryTerm[], locale: TranslationLocale, apiKey: string): Promise<Array<{ entry: GlossaryTerm; target: string | null }>> {
  const payload = Object.fromEntries(entries.map((entry, index) => [`t${index}`, entry.term]));
  const userMessage = [
    `Translate each term into ${locale.label}.`,
    "",
    "Input JSON:",
    JSON.stringify(payload, null, 1),
    "",
    "Return ONLY a JSON object with the same keys and translated values.",
  ].join("\n");

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await askModel({ locale, apiKey, appTitle: "dose.wiki glossary draft", userMessage, maxTokens: 8192 });
      const parsed = parseModelJson(response.content);
      if (parsed.ok && parsed.value) {
        const value = parsed.value;
        return entries.map((entry, index) => {
          const target = value[`t${index}`];
          return { entry, target: typeof target === "string" ? target : null };
        });
      }
    } catch (error) {
      if (attempt === 4) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** (attempt - 1)));
  }
  return entries.map((entry) => ({ entry, target: null }));
}

function collisionsIn(renderings: ReadonlyMap<string, string>): Array<[string, string[]]> {
  const byTarget = new Map<string, string[]>();
  for (const [term, target] of renderings) {
    const sources = byTarget.get(target);
    if (sources) sources.push(term);
    else byTarget.set(target, [term]);
  }
  return [...byTarget.entries()].filter(([, sources]) => sources.length > 1);
}

async function resolveCollisions(
  collisions: ReadonlyArray<[string, string[]]>,
  movableTerms: ReadonlySet<string>,
  locale: TranslationLocale,
  apiKey: string,
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  for (const [target, sources] of collisions) {
    const movable = sources.filter((term) => movableTerms.has(term));
    if (movable.length === 0) continue;
    const fixed = sources.filter((term) => !movable.includes(term));
    const response = await askModel({
      locale,
      apiKey,
      appTitle: "dose.wiki glossary collision",
      maxTokens: 2048,
      userMessage: [
        `These English terms all received the same ${locale.label} rendering "${target}", which loses a distinction the English makes:`,
        "",
        sources.map((term) => `- ${term}`).join("\n"),
        "",
        `Give each of these terms a distinct rendering: ${movable.join(", ")}.`,
        fixed.length > 0 ? `Leave "${fixed.join('", "')}" as "${target}"; that rendering is fixed.` : `One of them may keep "${target}".`,
        "",
        "Return ONLY a JSON object mapping each English term to its rendering.",
      ].join("\n"),
    });
    const parsed = parseModelJson(response.content);
    if (!parsed.ok || !parsed.value) continue;
    for (const term of movable) {
      const candidate = parsed.value[term];
      if (typeof candidate !== "string" || candidate.trim().length === 0) continue;
      if (isBlocking(validateSegment({ source: term, target: candidate, locale }).defects)) continue;
      resolved.set(term, candidate.trim());
    }
  }
  return resolved;
}

export type GlossaryDraftReport = {
  locale: string;
  universe: number;
  existing: number;
  drafted: number;
  flagged: Array<{ term: string; target: string; defects: string[] }>;
  failed: string[];
  collisions: Array<{ target: string; sources: string[] }>;
};

export type DraftGlossaryInput = {
  locale: string;
  reads: PublicDataReadAdapter;
  apiKey: string;
  onProgress?: (done: number, total: number) => void;
  dryRun?: boolean;
};

const BATCH = 40;
const CONCURRENCY = 16;

export async function draftGlossary({ locale: code, reads, apiKey, onProgress, dryRun = false }: DraftGlossaryInput): Promise<GlossaryDraftReport> {
  const locale = resolveLocale(code);
  const universe = await collectGlossaryTerms(reads);
  const existingRows = await readGlossaryRows(code);
  const existing = new Set(existingRows.map((row) => row.term.toLowerCase()));
  const pending = universe.filter((entry) => !existing.has(entry.term.toLowerCase()));
  const report: GlossaryDraftReport = { locale: code, universe: universe.length, existing: universe.length - pending.length, drafted: 0, flagged: [], failed: [], collisions: [] };
  if (dryRun || pending.length === 0) return report;

  const batches: GlossaryTerm[][] = [];
  for (let start = 0; start < pending.length; start += BATCH) batches.push(pending.slice(start, start + BATCH));
  const results = new Map<string, { target: string; kind: string }>();
  let cursor = 0;
  let done = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, async () => {
    while (cursor < batches.length) {
      const batch = batches[cursor];
      cursor += 1;
      for (const { entry, target } of await translateTermBatch(batch, locale, apiKey)) {
        const trimmed = target?.trim() ?? "";
        if (trimmed.length === 0) {
          report.failed.push(entry.term);
          continue;
        }
        const { defects } = validateSegment({ source: entry.term, target: trimmed, locale });
        if (isBlocking(defects)) report.flagged.push({ term: entry.term, target: trimmed, defects });
        results.set(entry.term, { target: trimmed, kind: entry.kind });
      }
      done += batch.length;
      onProgress?.(done, pending.length);
    }
  }));

  const renderings = () => new Map<string, string>([
    ...existingRows.map((row) => [row.term, row.target] as const),
    ...[...results].map(([term, record]) => [term, record.target] as const),
  ]);
  let collisions = collisionsIn(renderings());
  if (collisions.length > 0) {
    const resolved = await resolveCollisions(collisions, new Set(results.keys()), locale, apiKey);
    for (const [term, target] of resolved) {
      const record = results.get(term);
      if (record) results.set(term, { ...record, target });
    }
    collisions = collisionsIn(renderings());
  }
  report.collisions = collisions.map(([target, sources]) => ({ target, sources }));

  const drafts: GlossaryDraft[] = [...results].map(([term, record]) => ({ term, target: record.target, kind: record.kind }));
  report.drafted = await upsertGlossaryRows(code, drafts, { status: "draft", source: "model" });
  return report;
}
