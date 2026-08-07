#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as OCL from "openchemlib";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
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
const UPDATED_BY = "seed-convex-molecules";

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
Seed missing Convex molecule depictions from substanceIndex SMILES.

Usage:
  npm run molecules:seed-convex -- --dry-run --limit 5
  npm run molecules:seed-convex -- --write --confirm-molecule-seed

Options:
  --dry-run                  Read Convex and write local samples/report only (default)
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
  const convexUrl = write
    ? requireTargetUrl(runContext, "Convex write target")
    : requireSourceUrl(runContext, "configured Convex read target");

  printDataOpsRunContext(runContext);
  const client = new ConvexHttpClient(convexUrl);
  const [articles, existingRows] = await Promise.all([
    client.query(api.substanceIndex.getAll, {}),
    client.query(api.moleculeOverrides.listSlugs, {}),
  ]);
  const plan = buildMoleculeSeedPlan(
    articles,
    existingRows.map((row) => row.slug),
    limit,
  );

  const rendered: Array<{
    slug: string;
    title: string;
    smiles: string;
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
    target: convexUrl,
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
  console.log(write ? `Inserted: ${inserted}; concurrent skips: ${racedExisting}` : "Dry run: no Convex writes performed.");
  console.log(`Report: ${reportPath}`);
  for (const sample of sampleRows) {
    console.log(`Sample ${sample.slug}: ${sample.svgPath}`);
  }
}

await main();
