#!/usr/bin/env node
/**
 * Corpus-wide incremental refresh.
 *
 * Editing one paragraph on the site should cost one segment, not one corpus.
 * This command diffs the current sources against each corpus's own checkpoint,
 * reports what moved, drops the translations of segments that no longer exist,
 * re-translates only what is new or changed, and rebuilds the packs for the
 * corpora that actually changed.
 *
 * The diff baseline is the checkpoint the runs already keep: every translated
 * segment is stored under the hash of its English source, so a source that did
 * not change hashes to a translation that is already on disk and costs nothing.
 * That also means an unchanged translation is byte-identical across refreshes:
 * it is not retranslated, it is reused.
 *
 * Usage (the glossary lives in Postgres, so the same variables as translate.mjs):
 *   DATA_BACKEND=postgres bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/refresh.mjs [--locale zh-Hans] [--corpus a,b] [--plan] [--no-packs]
 */

import { readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { CORPORA, resolveCorpus } from "./corpora.mjs";
import { buildManifest, buildWorkUnits } from "./segment-manifest.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function localeDir(locale) {
  return path.join(repoRoot, "notes-and-plans/exports/translation", locale);
}

async function loadCheckpoint(file) {
  const done = new Map();
  if (!existsSync(file)) return done;
  const content = await readFile(file, "utf8");
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record.hash && typeof record.target === "string") done.set(record.hash, record);
    } catch {
      // A partially written final line is expected after an interrupted run.
    }
  }
  return done;
}

/**
 * Orphans are translations whose English no longer appears anywhere in the
 * corpus. Left in place they would be paid for once and then resurrect the day
 * an editor happens to retype the old sentence, so they are dropped.
 */
function planFor({ units, checkpoint }) {
  const wanted = new Set(units.map((unit) => unit.hash));
  const fresh = units.filter((unit) => !checkpoint.has(unit.hash));
  const orphans = [...checkpoint.keys()].filter((hash) => !wanted.has(hash));
  return { fresh, orphans, reused: units.length - fresh.length };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
  });
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      locale: { type: "string", default: "zh-Hans" },
      corpus: { type: "string" },
      plan: { type: "boolean", default: false },
      "no-packs": { type: "boolean", default: false },
      concurrency: { type: "string", default: "100" },
    },
  });

  const locale = values.locale;
  const ids = values.corpus
    ? values.corpus.split(",").map((id) => id.trim()).filter(Boolean)
    : Object.keys(CORPORA).filter((id) => existsSync(path.join(localeDir(locale), id, "translations.jsonl")));

  if (ids.length === 0) {
    console.error("No corpus has been run yet for this locale; nothing to refresh.");
    process.exit(1);
  }

  const changed = [];
  console.log(`Locale        ${locale}`);

  for (const id of ids) {
    const corpus = resolveCorpus(id);
    const dir = path.join(localeDir(locale), id);
    const checkpointPath = path.join(dir, "translations.jsonl");

    const { dataset, origin } = await corpus.load(null);
    const manifest = buildManifest(dataset, { locale, source: origin, corpus });
    const units = buildWorkUnits(manifest.segments);
    const checkpoint = await loadCheckpoint(checkpointPath);
    const plan = planFor({ units, checkpoint });

    const words = plan.fresh.reduce((total, unit) => total + unit.words, 0);
    console.log(
      `  ${id.padEnd(11)} ${String(units.length).padStart(6)} units · ${String(plan.reused).padStart(6)} reused · ${String(plan.fresh.length).padStart(5)} to translate (${words.toLocaleString()} words) · ${String(plan.orphans.length).padStart(5)} orphaned`,
    );

    if (values.plan) continue;
    if (plan.fresh.length === 0 && plan.orphans.length === 0) continue;

    // Rewriting the checkpoint without the orphans is what makes the drop real:
    // the runner resumes from this file, and a line left here is a line reused.
    if (plan.orphans.length > 0) {
      const kept = [...checkpoint.entries()].filter(([hash]) => !plan.orphans.includes(hash));
      const temporary = `${checkpointPath}.next`;
      await writeFile(temporary, kept.map(([, record]) => `${JSON.stringify(record)}\n`).join(""));
      await rename(temporary, checkpointPath);
    }

    changed.push(id);
    await run("bun", [
      "--preload",
      "./scripts/postgres/preload-server-only.ts",
      "scripts/translation/translate.mjs",
      `--locale=${locale}`,
      `--corpus=${id}`,
      "--resume",
      `--concurrency=${values.concurrency}`,
    ]);
  }

  if (values.plan) {
    console.log("\nPlan only: nothing translated, nothing rebuilt.");
    return;
  }

  if (changed.length === 0) {
    console.log("\nNothing changed. No model calls, no rebuild.");
    return;
  }

  console.log(`\nRefreshed     ${changed.join(", ")}`);
  if (values["no-packs"]) return;

  await run("node", ["scripts/translation/build-packs.mjs", `--locale=${locale}`]);
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
