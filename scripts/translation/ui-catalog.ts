/**
 * Build `src/i18n/messages/<locale>.json` from the English literals in the app.
 *
 * Scans `src/` for `t("...")`, `t('...')`, `t(\`...\`)` (no `${}`) and
 * `msg("...")` calls, keeps every catalog entry whose key is still in the
 * source, translates the keys the catalog lacks with the same model and prompt
 * as the article segments, and writes the catalog back sorted by key.
 *
 * Two data sources add keys the scanner cannot see because they reach the page
 * as data rendered through `t()`: the frozen glossary (effect names, effect
 * categories, chemical and psychoactive classes; pre-translated, so no model
 * call) and the Copy Studio blocks (checked-in defaults, plus the live rows
 * with `--live-copy`, since an editor may have changed them). The
 * pre-translated Layout run seeds any key it already answered.
 *
 * Usage:
 *   bun scripts/translation/ui-catalog.ts            # report only
 *   bun scripts/translation/ui-catalog.ts --write    # call the model, write the catalog
 *   bun scripts/translation/ui-catalog.ts --write --seed=notes-and-plans/exports/translation/zh-Hans/layout --live-copy
 *
 * `--live-copy` reads through the app's read adapter: set DATA_BACKEND and the
 * Postgres URL (or leave both unset for Convex) exactly as the app would.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { Glob } from "bun";
import * as live from "../../lib/translation/liveTranslation";
import { planBatches, translateBatchWithRetries, type WorkUnit } from "./engine.mjs";
import { segmentHash } from "./segment-manifest.mjs";
import { isBlocking } from "./validate.mjs";

const GLOSSARY_KINDS = new Set(["effect-name", "effect-category", "chemical-class", "psychoactive-class"]);

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
const catalogPath = path.join(repoRoot, "src/i18n/messages", `${localeCode}.json`);

/** `t("..")`, `t('..')`, `` t(`..`) `` without interpolation, and the `msg()` marker. Handles `\"` escapes. */
const CALL = /\b(?:t|msg)\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\$]|\\.)*)`)/g;

function unescape(literal: string): string {
  return literal.replace(/\\(.)/g, (_, ch: string) => (ch === "n" ? "\n" : ch));
}

async function collectKeys(): Promise<Map<string, Set<string>>> {
  const keys = new Map<string, Set<string>>();
  const glob = new Glob("src/**/*.{ts,tsx}");
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

/** Substance-index labels that reach the page as layout data rendered through `t()`. */
async function loadIndexLabelKeys(): Promise<Set<string>> {
  const out = new Set<string>();
  const file = path.join(repoRoot, "src/data/indexes/psychoactiveIndexManual.json");
  if (!existsSync(file)) return out;
  const document = JSON.parse(await readFile(file, "utf8")) as {
    categories?: Array<{ label?: string; sections?: Array<{ label?: string }> }>;
  };
  for (const category of document.categories ?? []) {
    if (category.label?.trim()) out.add(category.label);
    for (const section of category.sections ?? []) {
      if (section.label?.trim()) out.add(section.label);
    }
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

/** Frozen glossary terms whose kinds reach the page as data: pre-translated keys. */
async function loadGlossaryKeys(): Promise<Map<string, string>> {
  const file = path.join(repoRoot, "scripts/translation/glossary", `${localeCode}.json`);
  const out = new Map<string, string>();
  if (!existsSync(file)) return out;
  const document = JSON.parse(await readFile(file, "utf8")) as {
    terms?: Record<string, string | { target: string; kind?: string }>;
  };
  for (const [term, record] of Object.entries(document.terms ?? {})) {
    if (typeof record === "string") continue;
    if (record.kind && GLOSSARY_KINDS.has(record.kind) && record.target) out.set(term, record.target);
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
  add(JSON.parse(await readFile(path.join(repoRoot, "src/data/content/copyBlocks.json"), "utf8")));
  if (values["live-copy"]) {
    const { getPublicDataReadAdapter } = await import("../../lib/convex/publicData.reads");
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
  const glossary = await loadGlossaryKeys();
  for (const term of glossary.keys()) {
    if (!keys.has(term)) keys.set(term, new Set(["glossary"]));
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
    const locale = live.getTranslationLocale(localeCode);
    const rejected: string[] = [];
    for (const batch of planBatches(pending)) {
      const verdicts = await translateBatchWithRetries({ units: batch, locale, model: live.TRANSLATION_MODEL, apiKey });
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
