#!/usr/bin/env bun

/**
 * Seed/refresh the Postgres `moleculeOverrides` rows for chemical classes
 * (`class:<key>`) from the canonical SMILES in
 * data/substances/chemicalIndexManual.json (via CLASS_STRUCTURES).
 *
 * MOL blocks are generated exactly like the editor's class creation flow:
 * RDKit-JS automatic layout, which keeps every R position as a plain `*`
 * dummy atom with a V2000 atom map — the only spelling both RDKit and
 * OpenChemLib survive (see applyRLabelsToMolblock.ts). The svg is rendered on
 * the same OpenChemLib engine as substance rows, with the class's R-group
 * labels injected at draw time by atom index.
 *
 * Existing `class:` rows are skipped (and reported) by default; `--force`
 * re-seeds them through moleculeOverrides.replicate with `source: "seeded"`
 * provenance, after writing a full-row local backup.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import * as OCL from "openchemlib";
import initRDKitModule, { type JSMol, type RDKitModule } from "@rdkit/rdkit";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts";
import { renderMoleculeSvg } from "../../src/features/dev/tools/molecule-editor/renderMoleculeSvg";
import {
  classAtomLabels,
  parseClassDummies,
} from "../../src/features/dev/tools/molecule-editor/applyRLabelsToMolblock";
import {
  CLASS_STRUCTURES,
  type ClassStructureItem,
} from "../../src/features/dev/tools/molecule-editor/classStructures";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireAdminIntentToken,
  requireSourceUrl,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";

const DEFAULT_REPORT = "tmp/molecule-class-seed/report.json";
const UPDATED_BY = "seed-class-molecules";
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
Seed Postgres class molecule depictions (class:<key>) from chemicalIndexManual.json SMILES.

Usage:
  npm run molecules:seed-classes -- --dry-run
  TARGET_POSTGRES_URL=postgresql://localhost/dosewiki \\
    npm run molecules:seed-classes -- --apply --confirm-class-seed \\
    --confirm-write=seed-class-molecule-depictions \\
    --expected-deployment=localhost/dosewiki

Options:
  --dry-run             Read Postgres, render locally, print the per-class plan (default)
  --apply               Write rows (seedMissing; --force rows via replicate)
  --confirm-class-seed  Required with --apply
  --force               Re-seed classes that already have a class: row (backed up first)
  --key KEY             Only these class keys (comma list)
  --limit N             Process at most N classes
  --report PATH         Report path (default: ${DEFAULT_REPORT})
`);
}

/** The editor's generateClassMolblock, server-side: RDKit automatic layout. */
function generateClassMolblock(rdkit: RDKitModule, item: ClassStructureItem): string | null {
  let mol: JSMol | null = null;
  try {
    mol = rdkit.get_mol(item.smiles);
    if (!mol) return null;
    return mol.get_molblock();
  } catch {
    return null;
  } finally {
    mol?.delete();
  }
}

/** RDKit-JS loaded the same way the molecule-editor integration tests load it. */
async function loadRdkit(): Promise<RDKitModule> {
  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve("@rdkit/rdkit/dist/RDKit_minimal.wasm");
  const init = initRDKitModule as unknown as (options?: {
    locateFile?: () => string;
  }) => Promise<RDKitModule>;
  return init({ locateFile: () => wasmPath });
}

async function main() {
  const rawArgv = process.argv.slice(2);
  if (rawArgv.includes("--help") || rawArgv.includes("-h")) {
    printHelp();
    return;
  }

  const write = rawArgv.includes("--apply");
  const force = rawArgv.includes("--force");
  // The shared run context keys write mode off --write; --apply is this
  // script's execute flag, so a write run carries both.
  const argv = write
    ? [...rawArgv, "--write"]
    : rawArgv.includes("--dry-run")
      ? rawArgv
      : [...rawArgv, "--dry-run"];
  const limit = parsePositiveInteger(optionValue(argv, "--limit"), "--limit");
  const keyFilter = optionValue(argv, "--key");
  const onlyKeys = keyFilter
    ? new Set(
        keyFilter
          .split(",")
          .map((key) => key.trim())
          .filter(Boolean),
      )
    : null;
  const reportRelativePath = optionValue(argv, "--report") ?? DEFAULT_REPORT;
  const reportPath = resolve(process.cwd(), reportRelativePath);
  const runContext = createDataOpsRunContext({
    operation: "seed class molecule depictions",
    intent: "editorArticleWrite",
    argv,
    executeFlag: "--apply",
    requiresExecute: true,
    confirmationFlag: "--confirm-class-seed",
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
  const existingSlugs = new Set(
    (await client.query(api.moleculeOverrides.listSlugs, {})).map((row) => row.slug),
  );

  const selected = CLASS_STRUCTURES.filter((cls) => !onlyKeys || onlyKeys.has(cls.key)).slice(
    0,
    Number.isFinite(limit) ? limit : CLASS_STRUCTURES.length,
  );
  if (onlyKeys) {
    for (const key of onlyKeys) {
      if (!CLASS_STRUCTURES.some((cls) => cls.key === key)) {
        throw new Error(`--key ${key} has no structure.smiles entry in chemicalIndexManual.json.`);
      }
    }
  }

  type PlanAction = "seed" | "force-reseed" | "skip-existing";
  const plan = selected.map((cls) => {
    const slug = `class:${cls.key}`;
    const exists = existingSlugs.has(slug);
    const action: PlanAction = exists ? (force ? "force-reseed" : "skip-existing") : "seed";
    return { cls, slug, action };
  });
  for (const entry of plan) {
    console.log(`[plan] ${entry.action.padEnd(13)} ${entry.slug}`);
  }

  const backupDir = resolve(dirname(reportPath), "backup");
  const samplesDir = resolve(dirname(reportPath), "samples");
  mkdirSync(backupDir, { recursive: true });
  mkdirSync(samplesDir, { recursive: true });

  const actionable = plan.filter((entry) => entry.action !== "skip-existing");
  const skipped = plan.filter((entry) => entry.action === "skip-existing").map((e) => e.slug);
  const rendered: Array<{
    slug: string;
    key: string;
    action: PlanAction;
    smiles: string;
    molblock: string;
    svg: string;
  }> = [];
  const failures: Array<{ slug: string; reason: string }> = [];

  const rdkit = actionable.length > 0 ? await loadRdkit() : null;
  for (const { cls, slug, action } of actionable) {
    if (action === "force-reseed") {
      // Full-row local backup before anything is written anywhere.
      const row = await client.query(api.moleculeOverrides.getBySlug, { slug });
      if (!row) {
        failures.push({ slug, reason: "Row disappeared between list and read." });
        continue;
      }
      writeFileSync(
        resolve(backupDir, `${slug.replace(/[^a-z0-9-]/g, "_")}.json`),
        `${JSON.stringify(row, null, 2)}\n`,
      );
    }

    const molblock = generateClassMolblock(rdkit!, cls);
    if (!molblock) {
      failures.push({ slug, reason: "RDKit could not lay out the class SMILES." });
      continue;
    }
    const labels = classAtomLabels(parseClassDummies(molblock), cls.rLabels);
    if (Object.keys(labels).length !== Object.keys(cls.rLabels).length) {
      failures.push({
        slug,
        reason: `Resolved ${Object.keys(labels).length}/${Object.keys(cls.rLabels).length} R labels; refusing to render mislabeled dummies.`,
      });
      continue;
    }
    const svg = renderMoleculeSvg(OCL, molblock, labels);
    if (!svg) {
      failures.push({ slug, reason: "OpenChemLib could not render the generated molblock." });
      continue;
    }
    rendered.push({ slug, key: cls.key, action, smiles: cls.smiles, molblock, svg });
  }

  let inserted = 0;
  let overwritten = 0;
  let racedExisting = 0;
  if (write) {
    assertDataOpsWriteAllowed(runContext);
    const { token: apiKey } = requireAdminIntentToken("editorArticleWrite");
    for (const molecule of rendered) {
      if (molecule.action === "force-reseed") {
        // replicate keeps machine provenance (`source: "seeded"`) so a forced
        // re-seed stays overwritable by later seeds/template applies; `save`
        // would stamp it as a hand edit.
        await client.mutation(api.moleculeOverrides.replicate, {
          apiKey,
          slug: molecule.slug,
          svg: molecule.svg,
          molblock: molecule.molblock,
          smiles: molecule.smiles,
          source: "seeded",
          updatedAt: new Date().toISOString(),
          updatedBy: UPDATED_BY,
        });
        overwritten += 1;
      } else {
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
  }

  const sampleRows = rendered.slice(0, SAMPLE_COUNT).map((molecule) => {
    const safe = molecule.slug.replace(/[^a-z0-9-]/g, "_");
    const molPath = resolve(samplesDir, `${safe}.mol`);
    const svgPath = resolve(samplesDir, `${safe}.svg`);
    writeFileSync(molPath, molecule.molblock);
    writeFileSync(svgPath, molecule.svg);
    return { slug: molecule.slug, action: molecule.action, smiles: molecule.smiles, molPath, svgPath };
  });
  const report = {
    generatedAt: new Date().toISOString(),
    mode: write ? "write" : "dry-run",
    target: dataUrl,
    force,
    limit: Number.isFinite(limit) ? limit : null,
    keyFilter: onlyKeys ? [...onlyKeys] : null,
    summary: {
      classesWithStructure: CLASS_STRUCTURES.length,
      selected: selected.length,
      seedable: actionable.length,
      skippedExisting: skipped.length,
      rendered: rendered.length,
      renderFailures: failures.length,
      inserted,
      overwritten,
      racedExisting,
    },
    skippedExisting: skipped,
    failures,
    samples: sampleRows,
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Classes with structures: ${CLASS_STRUCTURES.length}; selected: ${selected.length}`);
  console.log(
    `To seed: ${actionable.length}; existing skipped: ${skipped.length}; ` +
      `rendered: ${rendered.length}; failures: ${failures.length}`,
  );
  console.log(
    write
      ? `Inserted: ${inserted}; force-overwritten: ${overwritten}; concurrent skips: ${racedExisting}`
      : "Dry run: no Postgres writes performed.",
  );
  console.log(`Report: ${reportPath}`);
  for (const sample of sampleRows) {
    console.log(`Sample ${sample.slug}: ${sample.svgPath}`);
  }
  if (failures.length > 0) process.exitCode = 1;
}

await main();
