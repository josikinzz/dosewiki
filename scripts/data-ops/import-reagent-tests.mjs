#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts";
import { assertDataOpsWriteAllowed,
createDataOpsRunContext,
getFlagValue,
printDataOpsRunContext,
requireAdminIntentToken,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"

const OPERATION = "import reagent tests";
const INTENT = "reagentTestImport";
const CONFIRMATION_FLAG = "--confirm-reagent-tests-import";
const BATCH_SIZE = 50;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isProtestKitResponse(value) {
  return Boolean(
    isRecord(value)
      && isRecord(value.substance)
      && typeof value.substance.name === "string"
      && Array.isArray(value.substance.aliases)
      && value.substance.aliases.every((alias) => typeof alias === "string")
      && Array.isArray(value.reagents)
      && value.reagents.every((reagent) =>
        isRecord(reagent)
          && typeof reagent.reagent === "string"
          && typeof reagent.hint === "string"
          && typeof reagent.isReacting === "boolean"
          && Array.isArray(reagent.colors)
          && reagent.colors.every((color) =>
            isRecord(color)
              && Number.isFinite(color.id)
              && typeof color.name === "string"
              && typeof color.simple === "boolean"
              && Number.isFinite(color.simpleColorId),
          ),
      ),
  );
}

export function buildReagentTestImportPlan({ snapshot, expectedSlugs, snapshotHash }) {
  if (!isRecord(snapshot)) {
    throw new Error("reagentTests.json must contain an object keyed by substance slug");
  }

  const actualSlugs = Object.keys(snapshot);
  const expectedSlugSet = new Set(expectedSlugs);
  const missing = expectedSlugs.filter((slug) => !Object.hasOwn(snapshot, slug));
  const unexpected = actualSlugs.filter((slug) => !expectedSlugSet.has(slug));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Snapshot slug mismatch: ${missing.length} missing, ${unexpected.length} unexpected`,
    );
  }

  const invalid = actualSlugs.filter((slug) => {
    const data = snapshot[slug];
    return data !== null && !isProtestKitResponse(data);
  });
  if (invalid.length > 0) {
    throw new Error(`Invalid reagent payloads: ${invalid.join(", ")}`);
  }

  const entries = expectedSlugs.map((slug) => ({ slug, data: snapshot[slug] }));
  const matched = entries.filter((entry) => entry.data !== null).length;

  return {
    snapshotHash,
    entries,
    matched,
    unmatched: entries.length - matched,
  };
}

function loadPlan(repoRoot) {
  const snapshotPath = resolve(repoRoot, "data/third-party/protestkit/reagentTests.json");
  const substancePath = resolve(repoRoot, "public/SubstanceIndex.json");
  if (!existsSync(snapshotPath)) {
    throw new Error(
      `Reagent snapshot missing at ${snapshotPath}. It is gitignored; run \`node scripts/data/cacheProtestKitReagentTests.mjs\` first (requires ProtestKit permission).`,
    );
  }
  const snapshotText = readFileSync(snapshotPath, "utf8");
  const snapshot = JSON.parse(snapshotText);
  const substances = JSON.parse(readFileSync(substancePath, "utf8"));
  if (!Array.isArray(substances)) {
    throw new Error("SubstanceIndex.json must contain an array");
  }

  const expectedSlugs = substances.map((article, index) => {
    if (!isRecord(article) || typeof article.slug !== "string" || !article.slug) {
      throw new Error(`SubstanceIndex article ${index + 1} has no slug`);
    }
    return article.slug;
  });
  const snapshotHash = createHash("sha256").update(snapshotText).digest("hex");

  return buildReagentTestImportPlan({ snapshot, expectedSlugs, snapshotHash });
}

export async function main(argv = process.argv.slice(2)) {
  const targetUrlArg = getFlagValue(argv, "--target");
  const env = targetUrlArg
    ? { ...process.env, TARGET_POSTGRES_URL: targetUrlArg }
    : process.env;
  const runContext = createDataOpsRunContext({
    operation: OPERATION,
    intent: INTENT,
    argv,
    env,
    targetUrlKeys: targetUrlArg ? ["TARGET_POSTGRES_URL"] : undefined,
    confirmationFlag: CONFIRMATION_FLAG,
    selectedTables: ["reagentTests"],
    localArtifacts: ["data/third-party/protestkit/reagentTests.json", "public/SubstanceIndex.json"],
  });
  if (targetUrlArg) runContext.targetUrlKey = "--target";

  const plan = loadPlan(runContext.repoRoot);
  printDataOpsRunContext(runContext);
  console.log(`Snapshot SHA-256: ${plan.snapshotHash}`);
  console.log(`Entries: ${plan.entries.length}`);
  console.log(`Matched: ${plan.matched}`);
  console.log(`Unmatched: ${plan.unmatched}`);
  console.log(`Batches: ${Math.ceil(plan.entries.length / BATCH_SIZE)} × up to ${BATCH_SIZE}`);

  if (!runContext.writeEnabled) {
    console.log("\nNo writes performed. Add --write and the required confirmation flags to import.");
    return;
  }
  if (!runContext.confirmationProvided) {
    throw new Error(`${OPERATION} requires ${CONFIRMATION_FLAG}.`);
  }

  assertDataOpsWriteAllowed(runContext);
  const targetUrl = requireTargetUrl(runContext);
  const apiKey = requireAdminIntentToken(INTENT, { env }).token;
  const client = createDataClient({ target: targetUrl }).client;
  const importedAt = Date.now();
  const { path: auditLogPath } = writeAuditLog({
    operation: "reagent-test-import",
    intent: INTENT,
    repoRoot: runContext.repoRoot,
    mutations: [{
      table: "reagentTests",
      snapshotHash: plan.snapshotHash,
      entries: plan.entries.length,
      matched: plan.matched,
      unmatched: plan.unmatched,
    }],
  });

  const totals = { created: 0, updated: 0, unchanged: 0 };
  try {
    for (let index = 0; index < plan.entries.length; index += BATCH_SIZE) {
      const entries = plan.entries.slice(index, index + BATCH_SIZE);
      const result = await client.mutation(api.reagentTests.bulkUpsert, {
        apiKey,
        snapshotHash: plan.snapshotHash,
        importedAt,
        entries,
      });
      totals.created += result.created;
      totals.updated += result.updated;
      totals.unchanged += result.unchanged;
      console.log(
        `Batch ${Math.floor(index / BATCH_SIZE) + 1}: `
          + `${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged`,
      );
    }

    const verified = await client.query(api.reagentTests.getSnapshotStats, {
      snapshotHash: plan.snapshotHash,
    });
    if (
      verified.total !== plan.entries.length
      || verified.matched !== plan.matched
      || verified.unmatched !== plan.unmatched
    ) {
      throw new Error(
        `Verification mismatch: expected ${plan.entries.length}/${plan.matched}/${plan.unmatched}, `
          + `received ${verified.total}/${verified.matched}/${verified.unmatched}`,
      );
    }

    updateAuditLog(auditLogPath, { status: "completed", totals, verified });
    console.log(
      `\nImport verified: ${verified.total} total, ${verified.matched} matched, `
        + `${verified.unmatched} unmatched.`,
    );
  } catch (error) {
    updateAuditLog(auditLogPath, {
      status: "failed",
      totals,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
