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
import { EFFECT_CATEGORY_DEFINITIONS } from "../../src/data/effectCategoryDefinitions";
import chemicalIndexManual from "@data/substances/chemicalIndexManual.json";
import psychoactiveIndexManual from "@data/substances/psychoactiveIndexManual.json";
import { SUBCATEGORY_LABELS } from "../../src/data/subjectiveEffectSubcategories";
import { DOSE_TIERS, DURATION_STAGES } from "../../src/features/article/components/sections/dosageDurationLabels";
import {
  CARCINOGENICITY_LEVEL_CONFIG,
  EVIDENCE_LEVEL_CONFIG,
  RISK_LEVEL_CONFIG,
} from "../../src/features/article/components/sections/harm-potential/harmPotentialLabels";
import { INTERACTION_TIERS } from "../../src/features/article/components/sections/interactionTierLabels";
import { ROUTE_VOCABULARY } from "../../src/features/article/components/sections/routeLabels";
import { EFFECT_ARTICLE_SECTION_TITLES } from "../../src/features/effects/articleSectionModel";
import { FLAT_CATEGORIES, PARENT_CATEGORIES, TABS } from "../../src/features/effects/pages/effectsIndexConfig";
import { REPLICATION_VOCABULARY } from "../../src/features/replications/replicationVocabulary";
import { REAGENT_LABELS } from "../../src/lib/reagentTesting";
import { CANONICAL_LEGAL_STATUSES, CANONICAL_STATUS_LABELS } from "../../src/schema/substance/legalStatuses";
import { getCatalogSchemaSections, getSubstanceSectionManifestEntries } from "../../src/schema/substance/sectionCatalog";
import type { PublicDataReadAdapter } from "../data/publicData.reads";
import { readGlossaryRows, upsertGlossaryRows, type GlossaryDraft } from "./glossary";

/**
 * The five terms the intensity scales label every effect with. They appear as
 * `[sup](common)[/sup]` inside scale rosters and as an ordered list in the
 * frequency article, so one rendering has to serve both or the two surfaces
 * stop agreeing.
 */
const FREQUENCY_TERMS = ["Rare", "Uncommon", "Common", "Frequent", "Near universal"];

/** The harm-reduction register: the words a reader meets on every page, small enough to hand-hold. */
const REGISTER_TERMS = [
  "come-up",
  "comedown",
  "dissociative",
  "deliriant",
  "dosage",
  "empathogenic",
  "entactogenic",
  "harm reduction",
  "hallucinogen",
  "psychedelic",
  "set and setting",
  "stimulant",
  "tolerance",
  "trip report",
  "withdrawal",
];

/**
 * The names the site and its lineage go by. A rendering equal to the term is
 * how a reviewer says "keep as-is": the drafter asks for a rendering like any
 * other term, and an approved row whose target is its own term pins the name
 * in Latin script across every segment that mentions it.
 */
const SITE_NAMES = [
  "dose.wiki",
  "Effect Index",
  "Subjective Effect Index",
  "SEI",
  "PsychonautWiki",
  "Disregard Everything I Say",
  "TripSit",
];

/**
 * The closed sets. A legal status, a dose tier, a duration stage, a harm level,
 * an evidence level and an interaction tier each have exactly one right
 * rendering, and each one appears both as a registry label and inside
 * substance prose. Left unfrozen they drift between the two: the layout
 * registry saying one thing and the article saying another about the same badge.
 */
const ENUM_LABELS: Record<string, readonly string[]> = {
  "legal-status": CANONICAL_LEGAL_STATUSES.map((value) => CANONICAL_STATUS_LABELS[value]),
  "dose-tier": DOSE_TIERS.map(({ label }) => label),
  "duration-stage": DURATION_STAGES.map(({ label }) => label),
  "risk-level": Object.values(RISK_LEVEL_CONFIG).map(({ label }) => label),
  "carcinogenicity-level": Object.values(CARCINOGENICITY_LEVEL_CONFIG).map(({ label }) => label),
  "evidence-level": Object.values(EVIDENCE_LEVEL_CONFIG).map(({ label }) => label),
  "interaction-tier": INTERACTION_TIERS.map(({ label }) => label),
};

export type GlossaryTerm = { term: string; kind: string };

/**
 * Every term the site publishes, deduped case-insensitively (first kind wins), sorted.
 *
 * Insertion order is kind precedence: a term two groups claim keeps the kind
 * of the earlier one ("Common" is a frequency before it is an index group,
 * "Psychedelic" a register word before a class). New groups go after the
 * existing ones so no historical row changes kind.
 */
export async function collectGlossaryTerms(reads: PublicDataReadAdapter): Promise<GlossaryTerm[]> {
  const terms = new Map<string, GlossaryTerm>();
  const add = (term: unknown, kind: string) => {
    const trimmed = String(term ?? "").trim();
    if (trimmed.length < 2 || terms.has(trimmed.toLowerCase())) return;
    terms.set(trimmed.toLowerCase(), { term: trimmed, kind });
  };

  for (const term of REGISTER_TERMS) add(term, "register");
  for (const effect of await reads.getPublicEffects()) add(effect.name, "effect-name");
  for (const category of EFFECT_CATEGORY_DEFINITIONS) add(category.name, "effect-category");
  for (const category of psychoactiveIndexManual.categories) add(category.label, "psychoactive-class");
  for (const term of FREQUENCY_TERMS) add(term, "frequency");
  for (const [group, labels] of Object.entries(ENUM_LABELS)) for (const label of labels) add(label, `enum:${group}`);
  for (const chemicalClass of chemicalIndexManual.classes) add(chemicalClass.label, "chemical-class");
  for (const term of REPLICATION_VOCABULARY) add(term, "replication");
  for (const term of SITE_NAMES) add(term, "site-name");
  for (const tab of TABS) add(tab.label, "index-name");
  for (const category of psychoactiveIndexManual.categories) {
    for (const section of category.sections) add(section.label, "index-name");
  }
  for (const category of PARENT_CATEGORIES) {
    add(category.displayTitle, "effect-subcategory");
    for (const subcategory of category.subcategories) add(subcategory.title, "effect-subcategory");
  }
  for (const category of FLAT_CATEGORIES) add(category.title, "effect-subcategory");
  for (const label of SUBCATEGORY_LABELS) add(label, "effect-subcategory");
  for (const entry of getSubstanceSectionManifestEntries()) add(entry.label, "section-heading");
  for (const section of getCatalogSchemaSections()) add(section.label, "section-heading");
  for (const title of Object.values(EFFECT_ARTICLE_SECTION_TITLES)) add(title, "section-heading");
  for (const term of ROUTE_VOCABULARY) add(term, "route");
  for (const term of REAGENT_LABELS) add(term, "reagent-name");
  for (const chemicalClass of chemicalIndexManual.classes) {
    for (const alias of chemicalClass.aliases) add(alias, "chemical-class-alias");
  }

  return [...terms.values()].sort((a, b) => a.term.localeCompare(b.term));
}

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
