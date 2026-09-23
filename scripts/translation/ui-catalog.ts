/**
 * Build `content/i18n/messages/<locale>.json` from the English literals in the app.
 *
 * Scans `src/` for `t("...")`, `t('...')`, `t(\`...\`)` (no `${}`) and
 * `msg("...")` calls and contextual message definitions. Approved human UI
 * renderings take precedence over approved glossary terms, then prior catalog
 * values and local seeds. Missing keys use the article translation engine.
 * Writes the catalog, server-only workbench inventory and compilation metadata.
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
 *   bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/ui-catalog.ts --offline --write
 *     # local seeds only; retains all existing entries, no database/model access
 *
 * Set DATA_BACKEND and the Postgres URL exactly as the app would; `--live-copy`
 * reads the Copy Studio rows through the same adapter. Compilation is not
 * publication; offline compilation does not verify current approved overrides.
 */
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
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
import { acceptedCheckpointTarget, catalogCheckpointKey, catalogUsesVCode, readCatalogCheckpoint, writeCatalogCheckpoint } from "./ui-catalog-checkpoint.mjs";
import { segmentHash } from "./segment-manifest.mjs";
import { isBlocking, validateSegment } from "./validate.mjs";
import { compileUiCatalog, expandUiGlossaryAliases, getUiCatalogGlossaryMisses } from "../../lib/translation/uiCatalogCompiler";
import { getApprovedUiTranslationsDigest, type UiCatalogPublication } from "../../lib/translation/uiCatalogPublication";
import { getUiMessageDefinition, UI_MESSAGE_ALIASES, UI_MESSAGE_DEFINITIONS } from "../../src/i18n/uiMessageDefinitions";
import { UI_MESSAGE_SEEDS } from "../../src/i18n/uiMessageSeeds";
import { guardTarget } from "../postgres/targetGuard";

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
    checkpoint: { type: "string" },
    "live-copy": { type: "boolean", default: false },
    write: { type: "boolean", default: false },
    "max-units": { type: "string" },
    offline: { type: "boolean", default: false },
    target: { type: "string" },
    "allow-remote": { type: "boolean", default: false },
  },
});

const localeCode = values.locale as string;
// Scratch-only destination prevents an accidental checkpoint overwriting a catalog.
const checkpointPath = values.checkpoint ? path.resolve(repoRoot, values.checkpoint) : undefined;
if (checkpointPath && !checkpointPath.startsWith(path.join(repoRoot, "tmp") + path.sep))
  throw new Error("--checkpoint must be a path under this checkout's ignored tmp/ directory");
const catalogPath = path.join(repoRoot, "content/i18n/messages", `${localeCode}.json`);
const publicationPath = path.join(repoRoot, "src/i18n/catalogPublication.json");
const digestPath = path.join(repoRoot, "src/i18n/catalogDigests.generated.json");
const inventoryPath = path.join(repoRoot, "src/i18n/uiWorkbenchInventory.generated.json");
if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(localeCode)) throw new Error("Invalid locale code");
if (values.offline && values["live-copy"]) throw new Error("--offline cannot read --live-copy");
if (!values.offline) {
  const target = values.target ?? process.env.TARGET_POSTGRES_URL;
  if (!target) throw new Error("Online catalog builds require --target <postgres-url> or TARGET_POSTGRES_URL; use --offline for local seeds only");
  guardTarget(target, values["allow-remote"]);
  process.env.DATA_BACKEND = "postgres";
  process.env.POSTGRES_POOLED_URL = target;
  delete process.env.POSTGRES_DIRECT_URL;
}

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
  return expandUiGlossaryAliases(out);
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
  for (const [id, definition] of Object.entries(UI_MESSAGE_DEFINITIONS)) {
    keys.set(id, new Set(definition.locations));
  }
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
  // Offline checks use only authored baseline terminology, never a stale
  // export masquerading as the current approved Postgres glossary.
  const baselineGlossary = new Map(Object.entries(UI_MESSAGE_DEFINITIONS).flatMap(([id, definition]) => {
    const target = UI_MESSAGE_SEEDS[localeCode]?.[id];
    return target ? definition.glossaryTerms.map((term) => [term, target] as const) : [];
  }));
  const glossary = values.offline ? new Map<string, string>() : await loadGlossaryKeys();
  const translationContext = values.offline ? undefined : await live.loadTranslationContext(localeCode);
  const auditGlossary = values.offline ? baselineGlossary : new Map([
    ...Object.entries(translationContext!.glossary), ...glossary,
  ]);
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
  const inventory = Object.fromEntries([...keys].filter(([key]) => !UI_MESSAGE_ALIASES[key]).map(([key, locations]) => {
    const definition = getUiMessageDefinition(key);
    const id = definition ? key : `legacy.${createHash("sha256").update(key).digest("hex")}`;
    return [id, {
      catalogKey: key,
      source: definition?.source ?? key,
      context: definition?.context ?? (key === "Light"
        ? "Dose intensity label: light. Appearance controls have a separate appearance.light message."
        : "UI label or copy rendered through the translation catalog. Inspect source locations for its usage."),
      locations: [...locations].sort(),
      glossaryTerms: definition?.glossaryTerms ?? [key],
    }];
  }).sort(([a], [b]) => String(a).localeCompare(String(b))));
  // Offline regeneration is limited to local seeds. It neither purports to
  // read current approvals nor drops entries from an incomplete local inventory.
  if (values.offline) for (const key of Object.keys(existing)) {
    if (!keys.has(key)) keys.set(key, new Set(["existing catalog (offline)"]));
  }
  const approvedOverrides = values.offline ? {} : await (
    await import("../../lib/translation/uiTranslationStore")
  ).readApprovedUiTranslations(localeCode);
  const { catalog: next, pending: pendingKeys, pendingRefresh } = compileUiCatalog({
    locale: localeCode, keys: keys.keys(), existing, glossary,
    approvedOverrides, auditGlossary, seed: await loadSeed(),
  });
  const keyByHash = new Map<string, string>();
  const pending: WorkUnit[] = pendingKeys.map((key) => {
    const definition = getUiMessageDefinition(key);
    const source = definition?.source ?? key;
    const hash = segmentHash(key);
    keyByHash.set(hash, key);
    return {
      hash, source, context: [definition?.context,
        /\[[^\]]+\]\(/.test(source) ? "Markdown copy: preserve each link destination and every {{placeholder}} exactly; translate only the link label and prose." : undefined,
      ].filter(Boolean).join("\n") || undefined, contextClass: "prose", group: "ui",
      markup: catalogUsesVCode(source), words: source.split(/\s+/).length, occurrences: keys.get(key)?.size ?? 1,
    };
  });
  const dropped = Object.keys(existing).filter((key) => !keys.has(key)).length;

  console.log(`Locale   ${localeCode}`);
  console.log(`Keys     ${keys.size} in source, ${Object.keys(existing).length} in catalog`);
  console.log(`Plan     ${Object.keys(next).length} resolved, ${pending.length} to translate, ${dropped} dropped`);
  console.log(`Refresh  ${pendingRefresh.length} existing entries disagree with ${values.offline ? "local baseline terminology (current approvals unverified, text preserved)" : "approved glossary (human overrides excluded)"}`);

  if (!values.write) {
    for (const unit of pending.slice(0, 40)) console.log(`  - ${JSON.stringify(unit.source)}`);
    if (pending.length > 40) console.log(`  ... ${pending.length - 40} more`);
    console.log("Dry run: pass --write to call the model and write the catalog");
    return;
  }

  const maxUnits = values["max-units"] === undefined ? Infinity : Number(values["max-units"]);
  if (values["max-units"] !== undefined && (!Number.isSafeInteger(maxUnits) || maxUnits < 0)) throw new Error("--max-units must be a non-negative integer");
  if (!values.offline && pending.length > maxUnits) throw new Error(`Catalog plan exceeds --max-units (${pending.length} > ${maxUnits}); no model calls or artifact writes performed`);

  if (pending.length > 0 && !values.offline) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is required to translate");
    const context = translationContext!;
    const rejected: string[] = [];
    // Keep contextual labels separate so dose-intensity terminology cannot
    // leak into an appearance label that happens to share its English word.
    const proseGlossary = Object.fromEntries(expandUiGlossaryAliases(new Map([...Object.entries(context.glossary), ...glossary])));
    const glossaryFor = (key: string) => {
      const definition = getUiMessageDefinition(key);
      return definition ? Object.fromEntries(Object.entries(proseGlossary).filter(([term]) => definition.glossaryTerms.some((allowed) => allowed.toLowerCase() === term.toLowerCase()))) : proseGlossary;
    };
    const validateUnit = (unit: WorkUnit, target: string) => validateSegment({
      source: unit.source, target, locale: context.locale, markup: unit.markup,
      glossary: glossaryFor(keyByHash.get(unit.hash)!),
    });
    const implementation = await Promise.all(["ui-catalog.ts", "ui-catalog-checkpoint.mjs", "engine.mjs", "locales.mjs", "validate.mjs", "markup.mjs"].map(async (file) =>
      createHash("sha256").update(await readFile(path.join(repoRoot, "scripts/translation", file))).digest("hex")));
    const checkpointContext = { schema: 1, locale: context.locale, glossary: proseGlossary,
      kinds: context.kinds, glosses: context.glosses, model: live.TRANSLATION_MODEL, approvedOverrides, implementation };
    const checkpointKeyFor = (unit: WorkUnit) => catalogCheckpointKey({ ...checkpointContext, unit });
    const saved = checkpointPath ? await readCatalogCheckpoint(checkpointPath) : {};
    let resumed = 0;
    const remaining = pending.filter((unit) => {
      const target = acceptedCheckpointTarget(saved, checkpointKeyFor(unit), (candidate) => validateUnit(unit, candidate));
      if (target === null) return true;
      next[keyByHash.get(unit.hash)!] = target;
      resumed += 1;
      return false;
    });
    console.log(`Resume   ${resumed} accepted entries reused; ${remaining.length} require generation`);
    const contextual = remaining.filter((unit) => getUiMessageDefinition(keyByHash.get(unit.hash)!));
    const batches = [...planBatches(remaining.filter((unit) => !contextual.includes(unit))), ...contextual.map((unit) => [unit])];
    let processed = resumed;
    for (const [batchIndex, batch] of batches.entries()) {
      const batchGlossary = glossaryFor(keyByHash.get(batch[0].hash)!);
      console.log(`Batch    ${batchIndex + 1}/${batches.length} started (${batch.length} entries; ${processed}/${pending.length} processed)`);
      const verdicts = await translateBatchWithRetries({
        units: batch,
        locale: context.locale,
        glossary: batchGlossary,
        kinds: context.kinds,
        glosses: context.glosses,
        model: live.TRANSLATION_MODEL,
        apiKey,
      });
      for (const verdict of verdicts) {
        if (isBlocking(verdict.defects) || verdict.target.length === 0 || isBlocking(validateUnit(verdict.unit, verdict.target).defects)) {
          rejected.push(`${JSON.stringify(verdict.unit.source)} (${verdict.defects.join(", ")})`);
          continue;
        }
        next[keyByHash.get(verdict.unit.hash)!] = verdict.target;
        saved[checkpointKeyFor(verdict.unit)] = verdict.target;
      }
      processed += batch.length;
      if (checkpointPath) await writeCatalogCheckpoint(checkpointPath, saved);
      console.log(`Batch    ${batchIndex + 1}/${batches.length} finished (${processed}/${pending.length} processed; ${rejected.length} rejected)`);
    }
    console.log(`Model    ${pending.length - rejected.length} translated, ${rejected.length} rejected`);
    for (const line of rejected) console.log(`  ! ${line}`);
    if (rejected.length > 0) throw new Error(`Catalog generation rejected ${rejected.length} entries; existing artifacts were preserved`);
  }

  if (!values.offline) {
    const context = translationContext!;
    for (const [key, target] of Object.entries(next)) {
      const definition = getUiMessageDefinition(key);
      const exactTarget = approvedOverrides[key] ?? definition?.glossaryTerms.map((term) => glossary.get(term)).find(Boolean) ?? glossary.get(key);
      const expandedGlossary = expandUiGlossaryAliases(new Map([...Object.entries(context.glossary), ...glossary]));
      const validationGlossary = definition ? Object.fromEntries([...expandedGlossary].filter(([term]) => definition.glossaryTerms.some((allowed) => allowed.toLowerCase() === term.toLowerCase()))) : Object.fromEntries(expandedGlossary);
      const result = validateSegment({ source: definition?.source ?? key, target, locale: context.locale, markup: catalogUsesVCode(definition?.source ?? key), exactTarget, glossary: validationGlossary });
      if (isBlocking(result.defects)) throw new Error(`Catalog validation failed for ${key}: ${result.defects.join(", ")}`);
      if (result.defects.length) console.log(`  QA ${JSON.stringify(key)}: ${result.defects.join(", ")}`);
    }
  }

  // Keep the exact English lookup keys; normalize target typography to the site's style.
  const sorted = Object.fromEntries(Object.entries(next)
    .map(([source, target]) => [source, target.replaceAll("\u2014", "\u2013")])
    .sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(catalogPath, `${JSON.stringify(sorted, null, 2)}\n`);
  await writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
  const publications: Record<string, UiCatalogPublication> = existsSync(publicationPath)
    ? JSON.parse(await readFile(publicationPath, "utf8")) : {};
  publications[localeCode] = {
    compiledAt: new Date().toISOString(),
    catalogDigest: getApprovedUiTranslationsDigest(sorted),
    approvedUiDigest: values.offline ? null : getApprovedUiTranslationsDigest(approvedOverrides),
    approvedUiSource: values.offline ? "offline-unverified" : "store",
    sourceInventoryDigest: createHash("sha256").update(JSON.stringify(inventory)).digest("hex"),
    pendingRefresh: values.offline ? pendingRefresh : [],
    qaGlossaryMisses: getUiCatalogGlossaryMisses(sorted, auditGlossary, approvedOverrides),
    exactLabels: Object.fromEntries([...new Set([...Object.keys(UI_MESSAGE_DEFINITIONS), ...Object.keys(approvedOverrides)])].filter((key) => sorted[key]).map((key) => [key, {
      source: getUiMessageDefinition(key)?.source ?? key, target: sorted[key], targetDigest: createHash("sha256").update(sorted[key]).digest("hex"),
    }])),
  };
  await writeFile(publicationPath, `${JSON.stringify(publications, null, 2)}\n`);
  await writeFile(digestPath, `${JSON.stringify(Object.fromEntries(Object.entries(publications).map(([locale, publication]) => [locale, publication.catalogDigest])), null, 2)}\n`);
  if (values.offline) console.log("Offline artifact: current human approvals and deployment have not been verified.");
  console.log(`Wrote    ${path.relative(repoRoot, catalogPath)} (${Object.keys(sorted).length} entries)`);
}

await main();
