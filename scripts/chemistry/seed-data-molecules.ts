#!/usr/bin/env bun

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as OCL from "openchemlib";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts";
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import { renderMoleculeSvg } from "../../src/features/dev/tools/molecule-editor/renderMoleculeSvg";
import { smilesToMolblock } from "../../src/features/dev/tools/molecule-editor/smilesToMolblock";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireAdminIntentToken,
  requireSourceUrl,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";
import { buildMoleculeSeedPlan } from "./moleculeSeedPlan";

const DEFAULT_REPORT = "tmp/molecule-seed/report.json";
const UPDATED_BY = "seed-data-molecules";
const GAP_FILL_COVERAGE_REPORT = "data/chemistry/smiles-coverage.json";

/**
 * slug → SMILES for articles without inline `identification.smiles`, from the
 * tracked SMILES-coverage resolution (the same source the retired static
 * pipeline drew from; plants/preparations resolve to their active molecule).
 * Multi-component preparations use the principal (first) component, matching
 * the retired renderer.
 */
function loadGapFillSmiles(repoRoot: string): Map<string, string> {
  const gapFill = new Map<string, string>();
  let entries: Array<{ slug?: unknown; smiles?: unknown }>;
  try {
    entries = JSON.parse(readFileSync(resolve(repoRoot, GAP_FILL_COVERAGE_REPORT), "utf8"));
  } catch {
    return gapFill;
  }
  for (const entry of entries) {
    if (typeof entry?.slug !== "string") continue;
    let smiles = "";
    if (typeof entry.smiles === "string") {
      smiles = entry.smiles;
    } else if (entry.smiles && typeof entry.smiles === "object" && "components" in entry.smiles) {
      const components: unknown = entry.smiles.components;
      if (components && typeof components === "object") {
        smiles =
          Object.values(components).find(
            (value): value is string => typeof value === "string" && value.trim() !== "",
          ) ?? "";
      }
    }
    if (smiles.trim()) gapFill.set(entry.slug, smiles.trim());
  }
  return gapFill;
}

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
Seed missing Postgres molecule depictions from substanceIndex SMILES.

Usage:
  npm run molecules:seed -- --dry-run --limit 5
  TARGET_POSTGRES_URL=postgresql://localhost/dosewiki \\
    npm run molecules:seed -- --write --confirm-molecule-seed \\
    --confirm-write=seed-canonical-molecule-depictions \\
    --expected-deployment=localhost/dosewiki

Options:
  --dry-run                  Read Postgres and write local samples/report only (default)
  --write                    Insert missing rows through moleculeOverrides.seedMissing
  --confirm-molecule-seed    Required with --write
  --limit N                  Process at most N missing rows
  --report PATH              Report path (default: ${DEFAULT_REPORT})
`);
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
  const reportRelativePath = optionValue(argv, "--report") ?? DEFAULT_REPORT;
  const reportPath = resolve(process.cwd(), reportRelativePath);
  const runContext = createDataOpsRunContext({
    operation: "seed canonical molecule depictions",
    intent: "editorArticleWrite",
    argv,
    executeFlag: "--write",
    requiresExecute: true,
    confirmationFlag: "--confirm-molecule-seed",
    selectedTables: ["substanceIndex", "moleculeOverrides"],
    localArtifacts: [reportRelativePath, `${dirname(reportRelativePath)}/samples/`],
    destructive: true,
  });
  const dataUrl = write
    ? requireTargetUrl(runContext, "Postgres write target")
    : requireSourceUrl(runContext, "configured Postgres read target");

  printDataOpsRunContext(runContext);
  const client = createDataClient({ target: dataUrl }).client;
  const [articles, existingRows] = await Promise.all([
    getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
    client.query(api.moleculeOverrides.listSlugs, {}),
  ]);
  const plan = buildMoleculeSeedPlan(
    articles,
    existingRows.map((row) => row.slug),
    limit,
    loadGapFillSmiles(runContext.repoRoot),
  );

  const rendered: Array<{
    slug: string;
    title: string;
    smiles: string;
    smilesSource: string;
    molblock: string;
    svg: string;
  }> = [];
  const failures: Array<{ slug: string; reason: string }> = [];

  for (const candidate of plan.candidates) {
    const molblock = await smilesToMolblock(candidate.smiles);
    if (!molblock) {
      failures.push({ slug: candidate.slug, reason: "OpenChemLib layout failed" });
      continue;
    }
    const svg = renderMoleculeSvg(OCL, molblock);
    if (!svg) {
      failures.push({ slug: candidate.slug, reason: "OpenChemLib render failed" });
      continue;
    }
    rendered.push({ ...candidate, molblock, svg });
  }

  let inserted = 0;
  let racedExisting = 0;
  if (write) {
    assertDataOpsWriteAllowed(runContext);
    const { token: apiKey } = requireAdminIntentToken("editorArticleWrite");
    for (const molecule of rendered) {
      const result = await client.mutation(api.moleculeOverrides.seedMissing, {
        apiKey,
        slug: molecule.slug,
        svg: molecule.svg,
        molblock: molecule.molblock,
        smiles: molecule.smiles,
        updatedBy: UPDATED_BY,
      });
      if (result.inserted) inserted += 1;
      else racedExisting += 1;
    }
  }

  const samplesDir = resolve(dirname(reportPath), "samples");
  mkdirSync(samplesDir, { recursive: true });
  const sampleRows = rendered.slice(0, 5).map((molecule) => {
    const molPath = resolve(samplesDir, `${molecule.slug}.mol`);
    const svgPath = resolve(samplesDir, `${molecule.slug}.svg`);
    writeFileSync(molPath, molecule.molblock);
    writeFileSync(svgPath, molecule.svg);
    return {
      slug: molecule.slug,
      title: molecule.title,
      smiles: molecule.smiles,
      molPath,
      svgPath,
    };
  });
  const report = {
    generatedAt: new Date().toISOString(),
    mode: write ? "write" : "dry-run",
    target: dataUrl,
    limit: Number.isFinite(limit) ? limit : null,
    summary: {
      ...plan.summary,
      rendered: rendered.length,
      renderFailures: failures.length,
      inserted,
      racedExisting,
    },
    failures,
    samples: sampleRows,
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Eligible selected: ${plan.summary.selected}`);
  console.log(`Rendered: ${rendered.length}; failures: ${failures.length}`);
  console.log(write ? `Inserted: ${inserted}; concurrent skips: ${racedExisting}` : "Dry run: no Postgres writes performed.");
  console.log(`Report: ${reportPath}`);
  for (const sample of sampleRows) {
    console.log(`Sample ${sample.slug}: ${sample.svgPath}`);
  }
}

await main();
