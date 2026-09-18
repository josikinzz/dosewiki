/**
 * Build `content/i18n/messages/<locale>.json` from the English literals in the app.
 *
 * Scans `src/` for `t("...")`, `t('...')`, `t(\`...\`)` (no `${}`) and
 * `msg("...")` calls, keeps every catalog entry whose key is still in the
 * source, translates the keys the catalog lacks with the same model and prompt
 * as the article segments, and writes the catalog back sorted by key.
 *
 * Data sources add keys the scanner cannot see because they reach the page as
 * data rendered through `t()`: the approved glossary in Postgres (the UI-label
 * kinds in `GLOSSARY_KINDS`; pre-translated, so no model call), the Copy Studio
 * blocks (checked-in defaults, plus the live rows with `--live-copy`), the
 * checked-in psychoactive and chemical class indexes, and the exact
 * classification values on substance records. The pre-translated Layout run
 * seeds any key it already answered.
 *
 * Usage (always through Postgres, where the glossary lives):
 *   DATA_BACKEND=postgres bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/ui-catalog.ts            # report only
 *   DATA_BACKEND=postgres bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/ui-catalog.ts --write    # call the model, write the catalog
 *   ... --write --seed=notes-and-plans/exports/translation/zh-Hans/layout --live-copy
 *
 * Set DATA_BACKEND and the Postgres URL exactly as the app would; `--live-copy`
 * reads the Copy Studio rows through the same adapter.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { Glob } from "bun";

import { splitAboutMarkdown } from "../../src/data/content/aboutSections";
import { DRUG_CLASS_CONTENT } from "../../src/data/drugClassContent";
import { PSYCHOACTIVE_SUMMARY_DEFINITIONS } from "../../src/features/psychoactive-summaries/summaryDefinitions";
import { readGlossaryRows } from "../../lib/translation/glossary";
import * as live from "../../lib/translation/liveTranslation";
import { planBatches, translateBatchWithRetries, type WorkUnit } from "./engine.mjs";
import { segmentHash } from "./segment-manifest.mjs";
import { isBlocking } from "./validate.mjs";

/** Glossary kinds whose terms can reach UI labels through `t()`. Classification
 * aliases and register terms are included because substance badges retain the
 * English value stored on the article rather than rewriting it to an index label. */
const GLOSSARY_KINDS = new Set([
  "effect-name",
  "effect-category",
  "chemical-class",
  "chemical-class-alias",
  "psychoactive-class",
  "register",
  "replication",
  "site-name",
  "index-name",
  "effect-subcategory",
  "section-heading",
  "route",
  "enum:interaction-tier",
  "reagent-name",
]);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    locale: { type: "string", default: "zh-Hans" },
    seed: { type: "string" },
    "live-copy": { type: "boolean", default: false },
    write: { type: "boolean", default: false },
  },
});

const localeCode = values.locale as string;
const catalogPath = path.join(repoRoot, "content/i18n/messages", `${localeCode}.json`);

/** `t("..")`, `t('..')`, `` t(`..`) `` without interpolation, and the `msg()` marker. Handles `\"` escapes. */
const CALL = /\b(?:t|msg)\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\$]|\\.)*)`)/g;

function unescape(literal: string): string {
  return literal.replace(/\\(.)/g, (_, ch: string) => (ch === "n" ? "\n" : ch));
}

async function collectKeys(): Promise<Map<string, Set<string>>> {
  const keys = new Map<string, Set<string>>();
  const glob = new Glob("{src,lib}/**/*.{ts,tsx}");
  for await (const relative of glob.scan({ cwd: repoRoot })) {
    if (relative.startsWith("src/i18n/") || /\.(test|spec)\.tsx?$/.test(relative)) continue;
    const text = await readFile(path.join(repoRoot, relative), "utf8");
    for (const match of text.matchAll(CALL)) {
      const key = unescape(match[1] ?? match[2] ?? match[3] ?? "");
      if (!key.trim()) continue;
      let files = keys.get(key);
      if (!files) keys.set(key, (files = new Set()));
      files.add(relative);
    }
  }
  return keys;
}

/**
 * Substance-index labels, class definitions, and warnings that reach the page
 * as layout data rendered through `t()`.
 */
async function loadIndexLabelKeys(): Promise<Set<string>> {
  const out = new Set<string>();
  const file = path.join(repoRoot, "data/substances/psychoactiveIndexManual.json");
  if (!existsSync(file)) return out;
  const document = JSON.parse(await readFile(file, "utf8")) as {
    categories?: Array<{
      label?: string;
      definition?: string;
      warning?: string;
      sections?: Array<{ label?: string }>;
    }>;
  };
  for (const category of document.categories ?? []) {
    for (const text of [category.label, category.definition, category.warning]) {
      if (text?.trim()) out.add(text);
    }
    for (const section of category.sections ?? []) {
      if (section.label?.trim()) out.add(section.label);
    }
  }
  return out;
}

/** Chemical-class labels, aliases, and descriptive prose rendered through `t()`. */
async function loadChemicalClassKeys(): Promise<Set<string>> {
  const out = new Set<string>();
  const file = path.join(repoRoot, "data/substances/chemicalIndexManual.json");
  if (!existsSync(file)) return out;
  const document = JSON.parse(await readFile(file, "utf8")) as {
    classes?: Array<{ label?: string; aliases?: string[]; description?: string }>;
  };
  for (const chemicalClass of document.classes ?? []) {
    for (const text of [
      chemicalClass.label,
      ...(chemicalClass.aliases ?? []),
      chemicalClass.description,
    ]) {
      if (text?.trim()) out.add(text);
    }
  }
  return out;
}

/** Category-page prose and section labels rendered through `t()`. */
function loadDrugClassContentKeys(): Set<string> {
  const out = new Set<string>();
  for (const content of DRUG_CLASS_CONTENT) {
    for (const text of [content.title, content.applicableSubstances]) {
      if (text.trim()) out.add(text.trim());
    }
    for (const match of content.introHtml.matchAll(/<p>(.*?)<\/p>/gs)) {
      const paragraph = match[1]?.trim();
      if (paragraph) out.add(paragraph);
    }
    for (const section of content.sections ?? []) {
      for (const text of [section.title, section.description]) {
        if (text.trim()) out.add(text.trim());
      }
    }
  }
  return out;
}

/**
 * Summary-page prose rendered through `t()`. The definitions used to carry
 * `msg()` markers in source; now they are JSON, so the same fields are walked
 * here. Mirror `PsychoactiveSummaryPage`'s `t()` calls when adding a field.
 */
function loadPsychoactiveSummaryKeys(): Set<string> {
  const out = new Set<string>();
  const add = (text: string) => {
    if (text.trim()) out.add(text);
  };
  for (const definition of PSYCHOACTIVE_SUMMARY_DEFINITIONS) {
    add(definition.title);
    add(definition.metadataTitle);
    add(definition.metadataDescription);
    for (const paragraph of definition.intro) add(paragraph.html);
    for (const section of definition.sections) {
      add(section.title);
      add(section.definitionHtml);
    }
    for (const link of definition.seeAlso) add(link.label);
  }
  return out;
}
type WarningBannerTextProjection = {
  severityLabel?: string;
  headline?: string;
  points: string[];
};

function projectWarningBannerText(row: unknown): WarningBannerTextProjection | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const severityLabel = "severityLabel" in row && typeof row.severityLabel === "string"
    ? row.severityLabel
    : undefined;
  const headline = "headline" in row && typeof row.headline === "string"
    ? row.headline
    : undefined;
  const rawPoints = "points" in row ? row.points : undefined;
  const points: string[] = Array.isArray(rawPoints)
    ? rawPoints.filter((point: unknown): point is string => typeof point === "string")
    : [];
  return { severityLabel, headline, points };
}


/** Live warning-banner copy rendered through `t()` on substance articles. */
async function loadWarningBannerKeys(): Promise<Set<string>> {
  const out = new Set<string>();
  if (!values["live-copy"]) return out;
  const { getPublicDataReadAdapter } = await import("../../lib/data/publicData.reads");
  const rawRows = await getPublicDataReadAdapter().getPublicWarningBannerPresets();
  if (!Array.isArray(rawRows)) {
    throw new Error("Public warning-banner corpus is not an array");
  }
  const rows: unknown[] = rawRows;
  for (const row of rows) {
    const preset = projectWarningBannerText(row);
    if (!preset) continue;
    for (const text of [preset.severityLabel, preset.headline]) {
      if (text?.trim()) out.add(text);
    }
    for (const point of preset.points) {
      if (point.trim()) out.add(point);
    }
  }
  return out;
}

/** Canonical English values rendered by substance classification badges. */
async function loadSubstanceClassificationKeys(): Promise<Set<string>> {
  const out = new Set<string>();
  const file = path.join(repoRoot, "public/SubstanceIndex.json");
  if (!existsSync(file)) return out;
  const documents = JSON.parse(await readFile(file, "utf8")) as Array<{
    classification?: {
      chemical_class?: string[];
      psychoactive_class?: string[];
    };
  }>;
  for (const document of documents) {
    for (const label of [
      ...(document.classification?.psychoactive_class ?? []),
      ...(document.classification?.chemical_class ?? []),
    ]) {
      if (label.trim()) out.add(label.trim());
    }
  }
  return out;
}

/**
 * Field labels the changelog derives from an inline edit's raw path
 * ("dosage.routes[0].dose_ranges.heavy" renders "Routes 1 › Dose ranges ›
 * Heavy"). Each path segment is one label translated on its own, so every
 * segment of every registered field path is a catalog key.
 */
async function loadFieldLabelKeys(): Promise<Set<string>> {
  const { FIELD_PATHS } = await import("../../src/data/schema/fieldRegistry.generated");
  const out = new Set<string>();
  for (const fieldPath of FIELD_PATHS) {
    for (const segment of fieldPath.split(".")) {
      const bare = segment.replace(/\[\d*\]$/, "").replace(/_/g, " ");
      if (bare.length > 0) out.add(bare.charAt(0).toUpperCase() + bare.slice(1));
    }
  }
  return out;
}

/**
 * About-page markdown sections. The locale route splits the editable document
 * with `splitAboutMarkdown` and translates each heading-less section body
 * through `t()`, so every body is one catalog key and must be cut by the same
 * splitter here or the lookup misses.
 */
async function loadAboutSectionKeys(): Promise<Set<string>> {
  const out = new Set<string>();
  const addDocument = (markdown: string, subtitle: string) => {
    const sections = splitAboutMarkdown(markdown.trim());
    for (const body of [sections.introduction, sections.sources, sections.history]) {
      if (body.trim()) out.add(body);
    }
    if (subtitle.trim()) out.add(subtitle.trim());
  };
  const readSeed = async (file: string) => {
    const full = path.join(repoRoot, file);
    return existsSync(full) ? readFile(full, "utf8") : "";
  };
  addDocument(
    await readSeed("content/about/about.md"),
    await readSeed("content/about/subtitle.md"),
  );
  // The editor-managed About document drifts from the checked-in seed, and
  // the locale route looks each live section up verbatim, so the live text
  // is what needs a catalog entry.
  if (values["live-copy"]) {
    const { getPublicDataReadAdapter } = await import("../../lib/data/publicData.reads");
    const about = await getPublicDataReadAdapter().getPublicAboutConfig();
    addDocument(about?.aboutMarkdown ?? "", about?.aboutSubtitle ?? "");
  }
  return out;
}

async function loadSeed(): Promise<Map<string, string>> {
  const seed = new Map<string, string>();
  if (!values.seed) return seed;
  const runDir = path.resolve(repoRoot, values.seed);
  const exportPath = path.join(runDir, "source-export.json");
  const checkpointPath = path.join(runDir, "translations.jsonl");
  if (!existsSync(exportPath) || !existsSync(checkpointPath)) {
    throw new Error(`${values.seed} lacks source-export.json or translations.jsonl`);
  }
  const sources = new Map<string, string>();
  const visit = (node: unknown): void => {
    if (typeof node === "string") sources.set(segmentHash(node), node);
    else if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === "object") Object.values(node).forEach(visit);
  };
  visit(JSON.parse(await readFile(exportPath, "utf8")));
  for (const line of (await readFile(checkpointPath, "utf8")).split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as { hash: string; target: string; defects?: string[] };
    const source = sources.get(entry.hash);
    if (!source || !entry.target || isBlocking(entry.defects ?? [])) continue;
    seed.set(source, entry.target);
  }
  return seed;
}

/** Approved glossary terms whose kinds reach the page as data: pre-translated keys. */
async function loadGlossaryKeys(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const row of await readGlossaryRows(localeCode, { status: "approved" })) {
    if (GLOSSARY_KINDS.has(row.kind)) out.set(row.term, row.target);
  }
  return out;
}

/** Copy Studio bodies: the checked-in defaults, plus the live rows on request. */
async function loadCopyKeys(): Promise<Set<string>> {
  const out = new Set<string>();
  const add = (rows: unknown) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      const body = (row as { body?: unknown }).body;
      if (typeof body === "string" && body.trim()) out.add(body);
      const items = (row as { items?: unknown }).items;
      if (Array.isArray(items)) for (const item of items) if (typeof item === "string" && item.trim()) out.add(item);
    }
  };
  add(JSON.parse(await readFile(path.join(repoRoot, "content/copy-blocks/copyBlocks.json"), "utf8")));
  if (values["live-copy"]) {
    const { getPublicDataReadAdapter } = await import("../../lib/data/publicData.reads");
    add(await getPublicDataReadAdapter().getPublicCopyBlocks());
  }
  return out;
}

async function main() {
  const keys = await collectKeys();
  for (const body of await loadCopyKeys()) {
    if (!keys.has(body)) keys.set(body, new Set(["copyBlocks"]));
  }
  for (const label of await loadIndexLabelKeys()) {
    if (!keys.has(label)) keys.set(label, new Set(["psychoactiveIndexManual"]));
  }
  for (const text of await loadChemicalClassKeys()) {
    if (!keys.has(text)) keys.set(text, new Set(["chemicalIndexManual"]));
  }
  for (const text of loadDrugClassContentKeys()) {
    if (!keys.has(text)) keys.set(text, new Set(["drugClassContent"]));
  }
  for (const text of loadPsychoactiveSummaryKeys()) {
    if (!keys.has(text)) keys.set(text, new Set(["psychoactiveSummaries"]));
  }
  for (const text of await loadWarningBannerKeys()) {
    if (!keys.has(text)) keys.set(text, new Set(["warningBanners"]));
  }
  const classificationKeys = await loadSubstanceClassificationKeys();
  for (const label of classificationKeys) {
    if (!keys.has(label)) keys.set(label, new Set(["SubstanceIndex.classification"]));
  }
  for (const section of await loadAboutSectionKeys()) {
    if (!keys.has(section)) keys.set(section, new Set(["aboutContent"]));
  }
  for (const label of await loadFieldLabelKeys()) {
    if (!keys.has(label)) keys.set(label, new Set(["fieldRegistry"]));
  }
  const glossary = await loadGlossaryKeys();
  for (const term of glossary.keys()) {
    if (!keys.has(term)) keys.set(term, new Set(["glossary"]));
  }
  const glossaryByFoldedTerm = new Map(
    [...glossary].map(([term, target]) => [term.toLocaleLowerCase("en-US"), target]),
  );
  for (const label of classificationKeys) {
    const target = glossaryByFoldedTerm.get(label.toLocaleLowerCase("en-US"));
    if (target && !glossary.has(label)) glossary.set(label, target);
  }
  const existing: Record<string, string> = existsSync(catalogPath)
    ? JSON.parse(await readFile(catalogPath, "utf8"))
    : {};
  const seed = new Map([...(await loadSeed()), ...glossary]);

  const next: Record<string, string> = {};
  const pending: WorkUnit[] = [];
  let seeded = 0;
  for (const key of keys.keys()) {
    if (existing[key]) {
      next[key] = existing[key];
    } else if (seed.has(key)) {
      next[key] = seed.get(key)!;
      seeded += 1;
    } else {
      pending.push({
        hash: segmentHash(key),
        source: key,
        contextClass: "prose",
        group: "ui",
        markup: false,
        words: key.split(/\s+/).length,
        occurrences: keys.get(key)!.size,
      });
    }
  }
  const dropped = Object.keys(existing).filter((key) => !keys.has(key)).length;

  console.log(`Locale   ${localeCode}`);
  console.log(`Keys     ${keys.size} in source, ${Object.keys(existing).length} in catalog`);
  console.log(`Plan     ${Object.keys(next).length - seeded} kept, ${seeded} seeded, ${pending.length} to translate, ${dropped} dropped`);

  if (!values.write) {
    for (const unit of pending.slice(0, 40)) console.log(`  - ${JSON.stringify(unit.source)}`);
    if (pending.length > 40) console.log(`  ... ${pending.length - 40} more`);
    console.log("Dry run: pass --write to call the model and write the catalog");
    return;
  }

  if (pending.length > 0) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is required to translate");
    const context = await live.loadTranslationContext(localeCode);
    const rejected: string[] = [];
    for (const batch of planBatches(pending)) {
      const verdicts = await translateBatchWithRetries({
        units: batch,
        locale: context.locale,
        glossary: context.glossary,
        kinds: context.kinds,
        glosses: context.glosses,
        model: live.TRANSLATION_MODEL,
        apiKey,
      });
      for (const verdict of verdicts) {
        if (isBlocking(verdict.defects) || verdict.target.length === 0) {
          rejected.push(`${JSON.stringify(verdict.unit.source)} (${verdict.defects.join(", ")})`);
          continue;
        }
        next[verdict.unit.source] = verdict.target;
      }
    }
    console.log(`Model    ${pending.length - rejected.length} translated, ${rejected.length} rejected`);
    for (const line of rejected) console.log(`  ! ${line}`);
  }

  const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(catalogPath, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`Wrote    ${path.relative(repoRoot, catalogPath)} (${Object.keys(sorted).length} entries)`);
}

await main();
