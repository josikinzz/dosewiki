#!/usr/bin/env node
/**
 * Copy the canonical molecule depiction set between Postgres deployments
 * (e.g. production → dev mirror) via `moleculeOverrides.replicate`, which
 * preserves each row's provenance (`source`, `updatedAt`, `updatedBy`)
 * verbatim.
 *
 * Dry run (default — queries only, prints the copy plan):
 *   SOURCE_POSTGRES_URL=postgresql://localhost/dosewiki \
 *   TARGET_POSTGRES_URL=postgresql://localhost/dosewiki \
 *   node scripts/data-ops/copy-molecule-overrides.mjs
 *
 * Write:
 *   SOURCE_POSTGRES_URL=... TARGET_POSTGRES_URL=... \
 *   node scripts/data-ops/copy-molecule-overrides.mjs --write \
 *     --confirm-molecule-copy \
 *     --confirm-write=<operationName> \
 *     --expected-deployment=<fingerprint> \
 *     [--delete-extra]
 *
 * `--delete-extra` (default OFF) also removes target rows absent on the
 * source via `moleculeOverrides.remove`; without it extras are only reported.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  hasFlag,
  printDataOpsRunContext,
  requireAdminIntentToken,
  requireSourceUrl,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";

const REPORT_RELATIVE_PATH = "tmp/molecule-copy/report.json";
const FETCH_BATCH_SIZE = 20;
const SAMPLE_SLUGS = 10;

const runContext = createDataOpsRunContext({
  operation: "copy molecule overrides between deployments",
  intent: "editorArticleWrite",
  sourceUrlKeys: ["SOURCE_POSTGRES_URL"],
  targetUrlKeys: ["TARGET_POSTGRES_URL"],
  selectedTables: ["moleculeOverrides"],
  confirmationFlag: "--confirm-molecule-copy",
  localArtifacts: [REPORT_RELATIVE_PATH],
  destructive: true,
});

const deleteExtra = hasFlag(runContext.argv, "--delete-extra");

let sourceUrl;
let targetUrl;
let adminToken = null;
try {
  sourceUrl = requireSourceUrl(runContext, "source Postgres URL (SOURCE_POSTGRES_URL)");
  targetUrl = requireTargetUrl(runContext, "target Postgres URL (TARGET_POSTGRES_URL)");
  if (runContext.writeRequested) {
    assertDataOpsWriteAllowed(runContext);
    adminToken = requireAdminIntentToken("editorArticleWrite").token;
  }
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}

const writeMode = runContext.writeEnabled && adminToken !== null;
const sourceClient = createDataClient({ target: sourceUrl }).client;
const targetClient = createDataClient({ target: targetUrl }).client;

async function fetchFullRows(client, slugs) {
  const rows = new Map();
  for (let i = 0; i < slugs.length; i += FETCH_BATCH_SIZE) {
    const batch = slugs.slice(i, i + FETCH_BATCH_SIZE);
    const fetched = await Promise.all(
      batch.map((slug) => client.query(api.moleculeOverrides.getBySlug, { slug })),
    );
    for (const row of fetched) {
      if (row) {
        rows.set(row.slug, row);
      }
    }
  }
  return rows;
}

function printBucket(label, slugs) {
  const sample = slugs.slice(0, SAMPLE_SLUGS).join(", ");
  console.log(`  ${label}: ${slugs.length}${sample ? ` — ${sample}` : ""}`);
}

async function main() {
  console.log("🧬 Copying molecule overrides between Postgres deployments");
  printDataOpsRunContext(runContext);
  console.log(`Delete extras: ${deleteExtra ? "yes (--delete-extra)" : "no (report only)"}`);

  const [sourceMeta, targetMeta] = await Promise.all([
    sourceClient.query(api.moleculeOverrides.listSlugs, {}),
    targetClient.query(api.moleculeOverrides.listSlugs, {}),
  ]);
  console.log(`Source rows: ${sourceMeta.length}; target rows: ${targetMeta.length}`);

  const targetBySlug = new Map(targetMeta.map((row) => [row.slug, row]));
  const sourceSlugSet = new Set(sourceMeta.map((row) => row.slug));

  const toCreate = [];
  const toUpdate = [];
  const sameUpdatedAt = [];
  for (const row of sourceMeta) {
    const target = targetBySlug.get(row.slug);
    if (!target) {
      toCreate.push(row.slug);
    } else if (target.updatedAt !== row.updatedAt) {
      toUpdate.push(row.slug);
    } else {
      // Same updatedAt: fall back to svg equality before calling it unchanged.
      sameUpdatedAt.push(row.slug);
    }
  }

  const unchanged = [];
  if (sameUpdatedAt.length > 0) {
    console.log(`Comparing svg for ${sameUpdatedAt.length} rows with matching updatedAt...`);
    const [sourceRows, targetRows] = await Promise.all([
      fetchFullRows(sourceClient, sameUpdatedAt),
      fetchFullRows(targetClient, sameUpdatedAt),
    ]);
    for (const slug of sameUpdatedAt) {
      const sourceRow = sourceRows.get(slug);
      const targetRow = targetRows.get(slug);
      if (sourceRow && targetRow && sourceRow.svg === targetRow.svg) {
        unchanged.push(slug);
      } else {
        toUpdate.push(slug);
      }
    }
  }

  const extras = targetMeta
    .filter((row) => !sourceSlugSet.has(row.slug))
    .map((row) => row.slug);

  console.log("\n📋 Copy plan");
  printBucket("Create (missing on target)", toCreate);
  printBucket("Update (updatedAt or svg differs)", toUpdate);
  printBucket("Unchanged", unchanged);
  printBucket(`Extra on target (${deleteExtra ? "will delete" : "report only"})`, extras);

  let copied = 0;
  let deleted = 0;
  const errors = [];

  if (writeMode) {
    const planned = [...toCreate, ...toUpdate];
    console.log(`\n✍️  Writing ${planned.length} rows to target...`);
    const sourceRows = await fetchFullRows(sourceClient, planned);
    for (const slug of planned) {
      const row = sourceRows.get(slug);
      if (!row) {
        errors.push(`${slug}: disappeared from source between plan and copy`);
        continue;
      }
      try {
        await targetClient.mutation(api.moleculeOverrides.replicate, {
          apiKey: adminToken,
          slug: row.slug,
          svg: row.svg,
          molblock: row.molblock,
          smiles: row.smiles,
          boldBonds: row.boldBonds,
          source: row.source,
          updatedAt: row.updatedAt,
          updatedBy: row.updatedBy,
        });
        copied += 1;
      } catch (error) {
        errors.push(`${slug}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (deleteExtra) {
      console.log(`🗑️  Deleting ${extras.length} extra target rows...`);
      for (const slug of extras) {
        try {
          await targetClient.mutation(api.moleculeOverrides.remove, {
            apiKey: adminToken,
            slug,
          });
          deleted += 1;
        } catch (error) {
          errors.push(`${slug}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    console.log(`Copied: ${copied}; deleted: ${deleted}; errors: ${errors.length}`);
    for (const message of errors) {
      console.log(`  ❌ ${message}`);
    }
  } else {
    console.log("\nDry run — no mutations were called. Re-run with --write to copy.");
  }

  const reportPath = resolve(runContext.repoRoot, REPORT_RELATIVE_PATH);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: writeMode ? "write" : "dry-run",
    sourceUrl,
    targetUrl,
    deleteExtra,
    counts: {
      source: sourceMeta.length,
      target: targetMeta.length,
      create: toCreate.length,
      update: toUpdate.length,
      unchanged: unchanged.length,
      extra: extras.length,
      copied,
      deleted,
      errors: errors.length,
    },
    create: toCreate,
    update: toUpdate,
    unchanged,
    extra: extras,
    errors,
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error("❌ Copy failed:", error);
  process.exit(1);
});
