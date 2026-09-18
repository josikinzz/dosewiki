/**
 * Seed the glossary glosses (`translationGlossaryTerms`, lib/translation/
 * glossaryGloss.ts) from the JSON files under `data/i18n/glossary/glosses/`. Each file
 * is a flat `{ "<term>": "<gloss>" }` map, split by topic so a writer owns
 * one file; every file is merged before loading.
 *
 * Every term is checked against the known-term set (`knownGlossaryTerms`:
 * the locale-independent universe the drafter and the import route use,
 * plus every term any locale's glossary already holds), case-insensitively;
 * that set supplies the kind and the stored spelling. A term outside it is
 * refused, and the run stops before writing anything, so a typo in a seed
 * file never becomes a gloss nothing injects. By default only terms without
 * a gloss are written, so a rerun fills gaps and leaves edits made in the
 * Glossary tab alone; `--force` overwrites every seeded term.
 *
 * Usage (the app's connection variables, pointed at an explicit target):
 *   npm run translate:glosses -- --dry-run                                   # validate and count, write nothing
 *   npm run translate:glosses -- --target postgres://localhost:5432/dosewiki
 *   npm run translate:glosses -- --force --target ... --allow-remote          # remote: also POSTGRES_IMPORT_CONFIRM=<host>
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { getPublicDataReadAdapter } from "../../lib/data/publicData.reads";
import { GLOSS_MAX_LENGTH, GlossaryGlossError, knownGlossaryTerms, loadGlosses, upsertGlosses } from "../../lib/translation/glossaryGloss";
import { guardTarget } from "../postgres/targetGuard";

const GLOSSES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../data/i18n/glossary/glosses");
const SEEDED_BY = "seed:load-glosses";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    target: { type: "string" },
    force: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    "allow-remote": { type: "boolean", default: false },
  },
});

const dryRun = values["dry-run"];
const target = values.target ?? process.env.TARGET_POSTGRES_URL;
if (!target) throw new Error("Pass --target <url> or set TARGET_POSTGRES_URL");
if (!dryRun) guardTarget(target, values["allow-remote"]);

// The store reads the app's connection variables lazily; a script points them
// at the explicit target only, so the app fallbacks never select a writer here.
process.env.DATA_BACKEND = "postgres";
process.env.POSTGRES_POOLED_URL = target;
delete process.env.POSTGRES_DIRECT_URL;

/** Every seed file merged; a term in two files is a writer conflict, reported by file. */
async function readSeeds(): Promise<Map<string, { gloss: string; file: string }>> {
  const files = (await readdir(GLOSSES_DIR)).filter((name) => name.endsWith(".json")).sort();
  if (files.length === 0) throw new Error(`No seed files under ${GLOSSES_DIR}`);
  const seeds = new Map<string, { gloss: string; file: string }>();
  const duplicates: string[] = [];
  for (const file of files) {
    const parsed: unknown = JSON.parse(await readFile(path.join(GLOSSES_DIR, file), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${file} is not a flat { term: gloss } object`);
    for (const [term, gloss] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof gloss !== "string") throw new Error(`${file}: the gloss for "${term}" is not a string`);
      const key = term.trim().toLowerCase();
      const prior = seeds.get(key);
      if (prior) duplicates.push(`"${term}" in ${file} and ${prior.file}`);
      seeds.set(key, { gloss, file });
    }
  }
  if (duplicates.length > 0) throw new Error(`Terms seeded twice:\n  ${duplicates.join("\n  ")}`);
  return seeds;
}

async function main() {
  const seeds = await readSeeds();
  const universe = await knownGlossaryTerms(getPublicDataReadAdapter());
  const byKey = new Map(universe.map((entry) => [entry.term.toLowerCase(), entry]));

  const unknown: string[] = [];
  const invalid: string[] = [];
  const rows: { term: string; kind: string; gloss: string }[] = [];
  for (const [key, { gloss, file }] of seeds) {
    const known = byKey.get(key);
    if (!known) {
      unknown.push(`${key} (${file})`);
      continue;
    }
    const trimmed = gloss.trim();
    if (trimmed.length === 0 || trimmed.length > GLOSS_MAX_LENGTH) {
      invalid.push(`${known.term} (${file}): ${trimmed.length} characters, limit ${GLOSS_MAX_LENGTH}`);
      continue;
    }
    rows.push({ term: known.term, kind: known.kind, gloss: trimmed });
  }
  if (unknown.length > 0) {
    console.error(`Refusing ${unknown.length} term(s) neither the site publishes nor any locale's glossary holds:\n  ${unknown.join("\n  ")}`);
    process.exitCode = 1;
  }
  if (invalid.length > 0) {
    console.error(`Refusing ${invalid.length} gloss(es) that are empty or over the limit:\n  ${invalid.join("\n  ")}`);
    process.exitCode = 1;
  }
  if (process.exitCode) return;

  const existing = await loadGlosses();
  const existingKeys = new Set(Object.keys(existing).map((term) => term.toLowerCase()));
  const pending = values.force ? rows : rows.filter((row) => !existingKeys.has(row.term.toLowerCase()));
  const skipped = rows.length - pending.length;

  console.log(`Seed files    ${seeds.size} term(s) across ${GLOSSES_DIR}`);
  console.log(`Known terms   ${universe.length}, ${Object.keys(existing).length} already glossed`);
  console.log(`To write      ${pending.length}${skipped > 0 ? ` (${skipped} already glossed, kept; pass --force to overwrite)` : ""}`);

  let written = 0;
  if (dryRun) {
    console.log("Dry run: drop --dry-run to write.");
  } else if (pending.length > 0) {
    try {
      written = await upsertGlosses(pending, SEEDED_BY);
    } catch (error) {
      if (error instanceof GlossaryGlossError) {
        console.error(error.message);
        process.exitCode = 1;
        return;
      }
      throw error;
    }
    console.log(`Written       ${written}`);
  }

  const glossed = new Set([...existingKeys, ...(dryRun ? [] : pending.map((row) => row.term.toLowerCase()))]);
  const missing = universe.filter((entry) => !glossed.has(entry.term.toLowerCase()));
  console.log(`Still without a gloss: ${missing.length}`);
  for (const entry of missing) console.log(`  ${entry.term}  [${entry.kind}]`);
}

await main();
