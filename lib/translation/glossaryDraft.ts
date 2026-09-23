/**
 * Draft a locale's glossary by machine, for a human to review.
 *
 * A term's rendering is never guessed inside a sentence. Each term is
 * translated once, alone, with the same model and the same gates the corpus
 * runs use, and written to `translationGlossary` as a draft. Alone is the
 * point: a term standing on its own has no sentence around it to bend it, so
 * the rendering that comes back is the rendering the term has, and once a
 * reviewer approves it the corpus is held to it.
 *
 * Terms come from the vocabularies the site already publishes: every public
 * effect name, every effect category and subcategory, every psychoactive and
 * chemical class and its aliases, the frequency scale, the closed enum labels
 * a badge or table row shows, the harm-reduction register, the replication
 * surface, the site and index names, article section headings, routes of
 * administration and reagent names. A term that already has a row, at any
 * status, is never redrafted: the reviewer's work outlives every rerun.
 *
 * Shared by `scripts/translation/build-glossary.mjs` and the Glossary tab's
 * "Draft missing terms" action, so the two cannot drift.
 */
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

/** One batch of terms to renderings; a batch that never parses is retried, since losing forty terms at once leaves a half-drafted list. */
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

/** `target -> terms` for every rendering more than one term landed on. */
function collisionsIn(renderings: ReadonlyMap<string, string>): Array<[string, string[]]> {
  const byTarget = new Map<string, string[]>();
  for (const [term, target] of renderings) {
    const sources = byTarget.get(target);
    if (sources) sources.push(term);
    else byTarget.set(target, [term]);
  }
  return [...byTarget.entries()].filter(([, sources]) => sources.length > 1);
}

/**
 * A second pass over the terms that landed on one rendering. The model sees
 * every colliding term at once, so it can move the one that should move rather
 * than inventing a synonym for both. A term that already has a row is shown
 * but never changed: the new term is the one that has to give way.
 */
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
  /** Every term the site publishes for this locale's universe. */
  universe: number;
  /** Terms that already had a row and were left alone. */
  existing: number;
  /** Draft rows written this run. */
  drafted: number;
  /** Terms the model rendered but the validator flagged; written as drafts for the reviewer with the defects listed here. */
  flagged: Array<{ term: string; target: string; defects: string[] }>;
  /** Terms with no usable rendering at all; not written. */
  failed: string[];
  /** Renderings still shared by more than one term after the collision pass. */
  collisions: Array<{ target: string; sources: string[] }>;
};

export type DraftGlossaryInput = {
  locale: string;
  reads: PublicDataReadAdapter;
  apiKey: string;
  /** Batch progress, for the CLI. */
  onProgress?: (done: number, total: number) => void;
  /** With `dryRun`, the universe is collected and counted and the model is never called. */
  dryRun?: boolean;
};

const BATCH = 40;
const CONCURRENCY = 16;

/** Draft every term the locale lacks and write the drafts; approved and existing draft rows are untouched. */
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

  // Two English terms sharing one rendering is the collision the audit exists
  // to catch. Reporting it and stopping would hand a reviewer a puzzle the
  // model can answer, so a clash goes back to the model with both terms in
  // front of it. What survives a second pass is a genuine homonym, and that is
  // the reviewer's call.
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
