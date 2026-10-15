#!/usr/bin/env node

import { createDataClient } from "../lib/data-client.ts";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireSourceUrl,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";
import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs";
import { resolveProductionSyncCredentials } from "./production-sync-credentials.mjs";
import {
  PRODUCTION_SYNC_OPERATION,
  planProductionSync,
  productionSyncUsage,
  runProductionSync,
} from "./production-sync.mjs";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(productionSyncUsage());
  process.exit(0);
}

const tablesArg = process.argv.find((arg) => arg.startsWith("--tables="));
const selectedTables = tablesArg
  ? tablesArg.replace("--tables=", "").split(",").map((table) => table.trim())
  : null;

const runContext = createDataOpsRunContext({
  operation: PRODUCTION_SYNC_OPERATION,
  intent: "production-sync",
  sourceUrlKeys: ["SOURCE_POSTGRES_URL", "POSTGRES_POOLED_URL", "POSTGRES_DIRECT_URL", "POSTGRES_POOLED_URL"],
  selectedTables,
  confirmationFlag: "--confirm-production-sync",
  destructive: true,
});

if (!runContext.writeEnabled) {
  const plan = planProductionSync(selectedTables);
  console.log("Plan only: no connection opened and nothing written.");
  console.log(`Tables to overwrite: ${plan.tables.join(", ") || "none"}`);
  console.log("Production backups taken before the first write:");
  for (const { table, label } of plan.backups) console.log(`  backup ${table} (${label})`);
  console.log(`\n${productionSyncUsage()}`);
  process.exit(0);
}

let sourceUrl;
let targetUrl;
let tableCredentials;
try {
  sourceUrl = requireSourceUrl(runContext, "source Postgres URL");
  targetUrl = requireTargetUrl(runContext, "target production Postgres URL");
  assertDataOpsWriteAllowed(runContext);
  tableCredentials = resolveProductionSyncCredentials({ selectedTables });
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}

const sourceClient = createDataClient({ target: sourceUrl }).client;
const targetClient = createDataClient({ target: targetUrl }).client;

async function main() {
  console.log("🚚 Syncing Postgres data from development to production\n");
  printDataOpsRunContext(runContext);

  const plan = planProductionSync(selectedTables);
  const { path: auditLogPath } = writeAuditLog({
    operation: "sync-data-to-production",
    intent: "production-sync",
    mutations: plan.tables.map((table) => ({ table, action: "sync" })),
  });
  console.log(`Audit log: ${auditLogPath}\n`);

  const { results, totalErrors, exitCode } = await runProductionSync({
    sourceClient,
    targetClient,
    selectedTables,
    credentials: tableCredentials,
  });

  console.log("\n" + "=".repeat(60));
  console.log("📊 Sync Complete\n");
  let totalCreated = 0;
  let totalUpdated = 0;
  for (const result of results) {
    const status = result.errors.length > 0 ? "⚠️" : "✅";
    console.log(`${status} ${result.table}: ${result.created} created, ${result.updated} updated`);
    totalCreated += result.created;
    totalUpdated += result.updated;
  }
  console.log("\n" + "-".repeat(40));
  console.log(`Total: ${totalCreated} created, ${totalUpdated} updated, ${totalErrors} errors`);

  updateAuditLog(auditLogPath, {
    result: {
      totalCreated,
      totalUpdated,
      totalErrors,
      tables: results.map((result) => ({
        table: result.table,
        created: result.created,
        updated: result.updated,
        errorCount: result.errors.length,
        backupPath: result.backupPath,
      })),
    },
    status: totalErrors > 0 ? "completed_with_errors" : "completed",
  });

  if (totalErrors > 0) {
    console.log("\n⚠️  Some errors occurred. Check output above for details.");
  } else {
    console.log("\n✨ All data synced successfully!");
  }
  process.exitCode = exitCode;
}

main().catch((error) => {
  console.error("❌ Sync failed:", error);
  process.exit(1);
});
