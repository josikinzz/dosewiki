#!/usr/bin/env bun

/**
 * One-time engine re-render: regenerate the stored `svg` of every existing
 * moleculeOverrides row from its own stored MOL block on the OpenChemLib
 * renderer (renderMoleculeSvg), replacing the retired RDKit output.
 *
 * MOL blocks, provenance (`source`), and smiles are untouched — only `svg`
 * (and its cache-busting `updatedAt`) change, through the svg-only
 * `moleculeOverrides.rerenderSvg` mutation, which also skips any row whose
 * molblock changed after this script read it.
 *
 * Usage:
 *   npm run molecules:rerender -- --dry-run
 *   npm run molecules:rerender -- --write --confirm-molecule-rerender
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as OCL from "openchemlib";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts";
import { renderMoleculeSvg } from "../../src/features/dev/tools/molecule-editor/renderMoleculeSvg";
import {
  classAtomLabels,
  parseClassDummies,
} from "../../src/features/dev/tools/molecule-editor/applyRLabelsToMolblock";
import { CLASS_STRUCTURES } from "../../src/features/dev/tools/molecule-editor/classStructures";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireAdminIntentToken,
  requireSourceUrl,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";

const DEFAULT_REPORT = "tmp/molecule-rerender/report.json";
const UPDATED_BY = "rerender-data-molecules";
const SAMPLE_COUNT = 5;

function optionValue(argv: string[], name: string): string | null {
  const equals = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? null : null;
}

function parsePositiveInteger(value: string | null, name: string): number {
  if (value === null) return Number.POSITIVE_INFINITY;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function printHelp() {
  console.log(`
Re-render every stored Postgres molecule depiction svg on the OpenChemLib engine.

Usage:
  npm run molecules:rerender -- --dry-run --limit 5
  npm run molecules:rerender -- --write --confirm-molecule-rerender

Options:
  --dry-run                    Read Postgres, render locally, write report/backups only (default)
  --write                      Update rows through moleculeOverrides.rerenderSvg
  --confirm-molecule-rerender  Required with --write
  --limit N                    Process at most N rows
  --slug SLUG                  Re-render only this slug (repeatable via comma list)
  --report PATH                Report path (default: ${DEFAULT_REPORT})
`);
}

/**
 * Draw-time R-group labels for a class row. Postgres class rows are
 * self-sufficient: `chemicalIndexManual.json` (via CLASS_STRUCTURES) supplies
 * the human labels when the class is still in the manual taxonomy; dummies it
 * does not name fall back to a generic `R<map>` so they never render as raw
 * `?` pseudoatoms.
 */
function classLabelsFor(slug: string, molblock: string): Record<number, string> | undefined {
  if (!slug.startsWith("class:")) return undefined;
  const key = slug.slice("class:".length);
  const cls = CLASS_STRUCTURES.find((item) => item.key === key);
  const dummies = parseClassDummies(molblock);
  const labels = classAtomLabels(dummies, cls?.rLabels ?? {});
  if (!cls) {
    for (const dummy of dummies) {
      labels[dummy.index] ??= `R${dummy.mapNum}`;
    }
  }
  return labels;
}

async function main() {
  const rawArgv = process.argv.slice(2);
  if (rawArgv.includes("--help") || rawArgv.includes("-h")) {
    printHelp();
    return;
  }

  const write = rawArgv.includes("--write");
  const argv = write || rawArgv.includes("--dry-run") ? rawArgv : [...rawArgv, "--dry-run"];
  const limit = parsePositiveInteger(optionValue(argv, "--limit"), "--limit");
  const slugFilter = optionValue(argv, "--slug");
  const onlySlugs = slugFilter
    ? new Set(
        slugFilter
          .split(",")
          .map((slug) => slug.trim())
          .filter(Boolean),
      )
    : null;
  const reportRelativePath = optionValue(argv, "--report") ?? DEFAULT_REPORT;
  const reportPath = resolve(process.cwd(), reportRelativePath);
  const runContext = createDataOpsRunContext({
    operation: "re-render molecule depiction svgs on the OpenChemLib engine",
    intent: "editorArticleWrite",
    argv,
    executeFlag: "--write",
    requiresExecute: true,
    confirmationFlag: "--confirm-molecule-rerender",
    selectedTables: ["moleculeOverrides"],
    localArtifacts: [
      reportRelativePath,
      `${dirname(reportRelativePath)}/backup/`,
      `${dirname(reportRelativePath)}/samples/`,
    ],
    destructive: true,
  });
  const dataUrl = write
    ? requireTargetUrl(runContext, "Postgres write target")
    : requireSourceUrl(runContext, "configured Postgres read target");

  printDataOpsRunContext(runContext);
  const client = createDataClient({ target: dataUrl }).client;
  const slugRows = await client.query(api.moleculeOverrides.listSlugs, {});
  const selected = slugRows
    .map((row) => row.slug)
    .filter((slug) => !onlySlugs || onlySlugs.has(slug))
    .slice(0, Number.isFinite(limit) ? limit : slugRows.length);

  const backupDir = resolve(dirname(reportPath), "backup");
  const samplesDir = resolve(dirname(reportPath), "samples");
  mkdirSync(backupDir, { recursive: true });
  mkdirSync(samplesDir, { recursive: true });

  const rendered: Array<{ slug: string; svg: string; expectedMolblock: string }> = [];
  const unchanged: string[] = [];
  const failures: Array<{ slug: string; reason: string }> = [];
  const samples: Array<{ slug: string; beforePath: string; afterPath: string }> = [];

  for (const slug of selected) {
    const row = await client.query(api.moleculeOverrides.getBySlug, { slug });
    if (!row) {
      failures.push({ slug, reason: "Row disappeared between list and read." });
      continue;
    }
    // Full-row local backup before anything is written anywhere.
    writeFileSync(
      resolve(backupDir, `${slug.replace(/[^a-z0-9-]/g, "_")}.json`),
      `${JSON.stringify(row, null, 2)}\n`,
    );

    const labels = classLabelsFor(slug, row.molblock);
    const svg = renderMoleculeSvg(OCL, row.molblock, labels, row.boldBonds ?? undefined);
    if (!svg) {
      failures.push({ slug, reason: "OpenChemLib could not render the stored molblock." });
      continue;
    }
    if (svg === row.svg) {
      unchanged.push(slug);
      continue;
    }
    if (samples.length < SAMPLE_COUNT) {
      const safe = slug.replace(/[^a-z0-9-]/g, "_");
      const beforePath = resolve(samplesDir, `${safe}.before.svg`);
      const afterPath = resolve(samplesDir, `${safe}.after.svg`);
      writeFileSync(beforePath, row.svg);
      writeFileSync(afterPath, svg);
      samples.push({ slug, beforePath, afterPath });
    }
    rendered.push({ slug, svg, expectedMolblock: row.molblock });
  }

  let updated = 0;
  let racedMolblockChanged = 0;
  let missingAtWrite = 0;
  if (write) {
    assertDataOpsWriteAllowed(runContext);
    const { token: apiKey } = requireAdminIntentToken("editorArticleWrite");
    for (const item of rendered) {
      const result = await client.mutation(api.moleculeOverrides.rerenderSvg, {
        apiKey,
        slug: item.slug,
        svg: item.svg,
        expectedMolblock: item.expectedMolblock,
        updatedBy: UPDATED_BY,
      });
      if (result.updated) updated += 1;
      else if (result.reason === "molblock-changed") racedMolblockChanged += 1;
      else missingAtWrite += 1;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: write ? "write" : "dry-run",
    target: dataUrl,
    limit: Number.isFinite(limit) ? limit : null,
    slugFilter: onlySlugs ? [...onlySlugs] : null,
    summary: {
      listed: slugRows.length,
      selected: selected.length,
      rerendered: rendered.length,
      unchanged: unchanged.length,
      failures: failures.length,
      updated,
      racedMolblockChanged,
      missingAtWrite,
    },
    failures,
    unchanged,
    samples,
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Rows listed: ${slugRows.length}; selected: ${selected.length}`);
  console.log(
    `Re-rendered: ${rendered.length}; unchanged: ${unchanged.length}; failures: ${failures.length}`,
  );
  console.log(
    write
      ? `Updated: ${updated}; molblock-changed skips: ${racedMolblockChanged}; missing: ${missingAtWrite}`
      : "Dry run: no Postgres writes performed.",
  );
  console.log(`Report: ${reportPath}`);
  for (const sample of samples) {
    console.log(`Sample ${sample.slug}: ${sample.afterPath}`);
  }
  if (failures.length > 0) process.exitCode = 1;
}

await main();
