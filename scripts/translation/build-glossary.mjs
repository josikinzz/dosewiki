#!/usr/bin/env bun
/**
 * Draft a locale's glossary into Postgres, or export it for review.
 *
 * The glossary lives in `translationGlossary` (lib/translation/glossary.ts).
 * `--locale X` renders every term the site publishes that the locale has no
 * row for, each alone, and writes the results as draft rows (`source` model);
 * a row that exists at any status is never touched, so a rerun only fills
 * gaps. A reviewer then approves or edits each draft in the Glossary tab
 * (`/dev/glossary`), and only approved rows reach a prompt.
 *
 * `--export` writes `data/i18n/glossary/<locale>.json`, a snapshot
 * of the table for diffing and review. Nothing reads that file at runtime.
 *
 * Usage (reads go through Postgres, so the app's connection variables apply):
 *   export DATA_BACKEND=postgres
 *   npm run translate:glossary -- --locale zh-Hans --dry-run     # count the missing terms, call nothing
 *   npm run translate:glossary -- --locale zh-Hans               # draft them (OPENROUTER_API_KEY)
 *   npm run translate:glossary -- --locale zh-Hans --export      # snapshot the table to glossary/zh-Hans.json
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { Agent, setGlobalDispatcher } from "undici";

import { getPublicDataReadAdapter } from "../../lib/data/publicData.reads.ts";
import { getPostgresClient } from "../../lib/postgres/runtime/backend.ts";
import { readGlossaryRows } from "../../lib/translation/glossary.ts";
import { draftGlossary } from "../../lib/translation/glossaryDraft.ts";
import { glossaryPath, resolveLocale } from "./locales.mjs";

setGlobalDispatcher(new Agent({ allowH2: false, connections: 64, headersTimeout: 300_000, bodyTimeout: 300_000 }));

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function exportSnapshot(locale) {
  const rows = await readGlossaryRows(locale.code);
  const outPath = glossaryPath(locale.code);
  const document = {
    locale: locale.code,
    exportedAt: new Date().toISOString(),
    note: "Export of the translationGlossary table for review and diffing. Nothing reads this file; edit terms in /dev/glossary and regenerate with build-glossary.mjs --export.",
    counts: {
      approved: rows.filter((row) => row.status === "approved").length,
      draft: rows.filter((row) => row.status === "draft").length,
    },
    terms: Object.fromEntries(rows.map((row) => [row.term, { target: row.target, kind: row.kind, status: row.status, source: row.source }])),
  };
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`Exported      ${rows.length} terms (${document.counts.approved} approved, ${document.counts.draft} draft)`);
  console.log(`Output        ${path.relative(repoRoot, outPath)}`);
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      locale: { type: "string", default: "zh-Hans" },
      "dry-run": { type: "boolean", default: false },
      export: { type: "boolean", default: false },
    },
  });

  const locale = resolveLocale(values.locale);
  if (values.export) {
    await exportSnapshot(locale);
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey && !values["dry-run"]) {
    console.error("Error: OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  const report = await draftGlossary({
    locale: locale.code,
    reads: getPublicDataReadAdapter(),
    apiKey: apiKey ?? "",
    dryRun: values["dry-run"],
    onProgress: (done, total) => process.stdout.write(`  ${done}/${total} terms\n`),
  });

  console.log(`Locale        ${report.locale}`);
  console.log(`Universe      ${report.universe} terms, ${report.existing} already in the table`);
  if (values["dry-run"]) {
    console.log(`Pending       ${report.universe - report.existing}`);
    console.log("\nDry run: no model calls made.");
    return;
  }
  console.log(`Drafted       ${report.drafted}`);
  console.log(`  flagged     ${report.flagged.length} (written as drafts; review these first)`);
  for (const item of report.flagged) console.log(`    ${item.term} -> ${item.target} [${item.defects.join(", ")}]`);
  console.log(`  failed      ${report.failed.length}${report.failed.length > 0 ? `: ${report.failed.join(", ")}` : ""}`);
  console.log(`  collisions  ${report.collisions.length}`);
  for (const { target, sources } of report.collisions.slice(0, 10)) console.error(`    collision: ${sources.join(" / ")} -> ${target}`);
  if (report.collisions.length > 0) process.exitCode = 1;
  console.log(`\nReview the drafts in /dev/glossary, then run ${path.relative(repoRoot, fileURLToPath(import.meta.url))} --locale ${locale.code} --export to snapshot the table.`);
}

try {
  await main();
} catch (error) {
  console.error(error?.message ?? error);
  process.exitCode = 1;
} finally {
  await getPostgresClient().end();
}
