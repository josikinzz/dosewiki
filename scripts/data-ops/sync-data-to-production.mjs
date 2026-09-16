#!/usr/bin/env node
/**
 * Sync Postgres data from development to production.
 *
 * Usage:
 *   node scripts/data-ops/sync-data-to-production.mjs \
 *     --tables=prompts,quotes --write --confirm-production-sync \
 *     --confirm-write=sync-data-data-to-production \
 *     --expected-deployment=<target-deployment>
 *
 * Environment:
 *   SOURCE_POSTGRES_URL - Dev deployment (defaults to .env.local POSTGRES_POOLED_URL)
 *   TARGET_POSTGRES_URL - Prod deployment (required)
 *
 * Available tables:
 *   - substanceIndex
 *   - categoryLayout
 *   - siteConfig (About page content)
 *   - indexLayouts
 *   - tripReports
 *   - subjectiveEffects
 *   - effectIndexArticles
 *   - prompts
 *   - quotes
 *   - replications (metadata only - file storage IDs are deployment-specific)
 */

// Parse --tables flag
const tablesArg = process.argv.find(arg => arg.startsWith('--tables='));
const selectedTables = tablesArg
  ? tablesArg.replace('--tables=', '').split(',').map(t => t.trim())
  : null; // null means sync all

function shouldSync(tableName) {
  return selectedTables === null || selectedTables.includes(tableName);
}

import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts";
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import { normalizeQuoteSectionId } from "../../lib/quoteSections.mjs";
import { sanitizeObjectKeys } from "../batch/summary/articles.mjs";
import { ARTICLE_SOURCE_DOCUMENT_MAX_BYTES } from "../article-source-documents/contract.mjs";
import { assertDataOpsWriteAllowed,
backupBeforeWrite,
batchAndApplyMutations,
createDataOpsRunContext,
printDataOpsRunContext,
requireSourceUrl,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"
import { resolveProductionSyncCredentials } from "./production-sync-credentials.mjs";

const runContext = createDataOpsRunContext({
  operation: "sync Postgres data to production",
  intent: "production-sync",
  sourceUrlKeys: ["SOURCE_POSTGRES_URL", "POSTGRES_POOLED_URL", "POSTGRES_DIRECT_URL", "POSTGRES_POOLED_URL"],
  targetUrlKeys: ["TARGET_POSTGRES_URL"],
  selectedTables,
  confirmationFlag: "--confirm-production-sync",
  destructive: true,
});

let sourceUrl;
let targetUrl;
try {
  sourceUrl = requireSourceUrl(runContext, "source Postgres URL");
  targetUrl = requireTargetUrl(runContext, "target production Postgres URL");
  assertDataOpsWriteAllowed(runContext);
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}

const sourceClient = createDataClient({ target: sourceUrl }).client;
const targetClient = createDataClient({ target: targetUrl }).client;

let tableCredentials;
try {
  tableCredentials = resolveProductionSyncCredentials({ selectedTables });
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}

const BATCH_SIZE = 20;

/**
 * Strip Postgres internal fields from documents.
 */
function sanitize(docs) {
  return docs.map(({ _id, _creationTime, ...doc }) => doc);
}

/**
 * Transform documents for specific tables that have different bulkImport schemas.
 */
function transformForTable(name, docs) {
  switch (name) {
    case "quotes":
      // bulkImport expects: { slug, section, content }
      return docs.map(({ slug, section, content }) => ({
        slug,
        section: normalizeQuoteSectionId(section) ?? section,
        content,
      }));
    case "prompts":
      // bulkImport expects: { key, content }
      return docs.map(({ key, content }) => ({ key, content }));
    case "replications":
      // bulkImport expects all fields except created_at
      return docs.map((doc) => {
        const rest = { ...doc };
        delete rest.created_at;
        return rest;
      });
    default:
      return docs;
  }
}

/**
 * Sync a table from source to target using the shared batch helper.
 */
async function syncTable(name, getAllQuery, bulkImportMutation, options = {}) {
  console.log(`\n📦 Syncing ${name}...`);

  try {
    // Fetch all documents from source
    const docs = await sourceClient.query(getAllQuery, {});
    const sanitizedDocs = transformForTable(name, sanitize(docs));

    console.log(`   Found ${sanitizedDocs.length} documents in source`);

    if (sanitizedDocs.length === 0) {
      console.log(`   ⏭️  Skipping (no data)`);
      return { table: name, created: 0, updated: 0, errors: [] };
    }

    const totalBatches = Math.ceil(sanitizedDocs.length / BATCH_SIZE);

    const result = await batchAndApplyMutations({
      items: sanitizedDocs,
      batchSize: BATCH_SIZE,
      mutation: bulkImportMutation,
      transformBatch: (batch) => {
        const mutationArgs = { [options.argName || name]: batch };
        // Add auth for tables that require it
        if (options.requiresAuth) {
          mutationArgs.apiKey = tableCredentials[name].token;
          mutationArgs.updatedBy = "sync-script";
        }
        return mutationArgs;
      },
      onBatchResult: (batchResult, batchIndex) => {
        console.log(`   Batch ${batchIndex + 1}/${totalBatches}: ✓ (created: ${batchResult.created}, updated: ${batchResult.updated})`);
      },
      onBatchError: (error, batchIndex) => {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`   Batch ${batchIndex + 1}/${totalBatches}: ✗ Error: ${msg}`);
      },
      client: targetClient,
    });

    return { table: name, created: result.totalCreated, updated: result.totalUpdated, errors: result.allErrors };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`   ❌ Failed to fetch: ${msg}`);
    return { table: name, created: 0, updated: 0, errors: [msg] };
  }
}

async function main() {
  console.log("🚚 Syncing Postgres data from development to production\n");
  printDataOpsRunContext(runContext);

  // Write audit log before making changes
  const syncedTableNames = selectedTables ?? [
    "substanceIndex", "categoryLayout", "siteConfig", "indexLayouts",
    "tripReports", "subjectiveEffects", "effectIndexArticles",
    "prompts", "quotes", "replications"
  ];
  const { path: auditLogPath } = writeAuditLog({
    operation: "sync-data-to-production",
    intent: "production-sync",
    mutations: syncedTableNames.map((table) => ({ table, action: "sync" })),
  });
  console.log(`Audit log: ${auditLogPath}\n`);

  const results = [];

  // Sync substanceIndex (substance articles with batch-generated content)
  if (shouldSync("substanceIndex")) {
    console.log("\n📦 Syncing substanceIndex...");
    try {
      // Backup production substanceIndex before overwriting
      const { path: backupPath, documentCount: backupCount } = await backupBeforeWrite({
        sourceClient: targetClient,
        queryAll: () => getAllSubstanceDocuments(targetClient, api.substanceIndex.getFullDocumentPage),
        label: "substanceIndex-production",
      });
      console.log(`   Backup: ${backupPath} (${backupCount} documents)`);

      const articles = await getAllSubstanceDocuments(sourceClient, api.substanceIndex.getFullDocumentPage);
      const sanitizedArticles = articles.map(({ _id, _creationTime, ...doc }) => sanitizeObjectKeys(doc));
      console.log(`   Found ${sanitizedArticles.length} articles in source`);

      if (sanitizedArticles.length > 0) {
        const totalBatches = Math.ceil(sanitizedArticles.length / BATCH_SIZE);
        let totalSkipped = 0;

        const result = await batchAndApplyMutations({
          items: sanitizedArticles,
          batchSize: BATCH_SIZE,
          mutation: api.substanceIndex.saveSubstances,
          transformBatch: (batch) => ({
            apiKey: tableCredentials.substanceIndex.token,
            articles: batch,
          }),
          onBatchResult: (batchResult, batchIndex) => {
            totalSkipped += batchResult.skipped || 0;
            const skippedText = batchResult.skipped ? `, skipped: ${batchResult.skipped}` : "";
            console.log(`   Batch ${batchIndex + 1}/${totalBatches}: ✓ (created: ${batchResult.created}, updated: ${batchResult.updated}${skippedText})`);
          },
          onBatchError: (error, batchIndex) => {
            const msg = error instanceof Error ? error.message : String(error);
            console.log(`   Batch ${batchIndex + 1}/${totalBatches}: ✗ Error: ${msg}`);
          },
          client: targetClient,
        });

        const skippedText = totalSkipped ? `, skipped: ${totalSkipped}` : "";
        console.log(`   ✓ Sync complete (created: ${result.totalCreated}, updated: ${result.totalUpdated}${skippedText})`);
        results.push({ table: "substanceIndex", created: result.totalCreated, updated: result.totalUpdated, skipped: totalSkipped, errors: result.allErrors, backupPath });
      } else {
        console.log("   ⏭️  Skipping (no data)");
        results.push({ table: "substanceIndex", created: 0, updated: 0, errors: [] });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ Failed: ${msg}`);
      results.push({ table: "substanceIndex", created: 0, updated: 0, errors: [msg] });
    }
  }

  // Sync categoryLayout (single document for home page)
  if (shouldSync("categoryLayout")) {
    console.log("\n📦 Syncing categoryLayout...");
    try {
      const layout = await sourceClient.query(api.categoryLayout.get, {});
      if (layout) {
        const { _id, _creationTime, ...data } = layout;
        await targetClient.mutation(api.categoryLayout.save, {
          ...data,
          apiKey: tableCredentials.categoryLayout.token,
        });
        console.log("   ✓ Synced categoryLayout");
        results.push({ table: "categoryLayout", created: 1, updated: 0, errors: [] });
      } else {
        console.log("   ⏭️  Skipping (no data)");
        results.push({ table: "categoryLayout", created: 0, updated: 0, errors: [] });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ Failed: ${msg}`);
      results.push({ table: "categoryLayout", created: 0, updated: 0, errors: [msg] });
    }
  }

  // Sync siteConfig (About page content)
  if (shouldSync("siteConfig")) {
    console.log("\n📦 Syncing siteConfig...");
    try {
      const config = await sourceClient.query(api.siteConfig.getAbout, {});
      if (config) {
        const data = { ...config };
        delete data._id;
        delete data._creationTime;
        delete data.key;
        delete data.updatedAt;
        await targetClient.mutation(api.siteConfig.saveAbout, {
          ...data,
          apiKey: tableCredentials.siteConfig.token,
          updatedBy: "sync-script",
        });
        console.log("   ✓ Synced siteConfig (About page)");
        results.push({ table: "siteConfig", created: 1, updated: 0, errors: [] });
      } else {
        console.log("   ⏭️  Skipping (no data)");
        results.push({ table: "siteConfig", created: 0, updated: 0, errors: [] });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ Failed: ${msg}`);
      results.push({ table: "siteConfig", created: 0, updated: 0, errors: [msg] });
    }
  }

  // Sync indexLayouts (psychoactive, chemical, mechanism)
  if (shouldSync("indexLayouts")) {
    results.push(await syncTable(
      "indexLayouts",
      api.indexLayouts.getAll,
      api.indexLayouts.bulkImport,
      { argName: "layouts", requiresAuth: true }
    ));
  }

  // Sync tripReports
  if (shouldSync("tripReports")) {
    results.push(await syncTable(
      "tripReports",
      api.tripReports.getAll,
      api.tripReports.bulkImport,
      { argName: "reports" }
    ));
  }

  // Sync subjectiveEffects
  if (shouldSync("subjectiveEffects")) {
    results.push(await syncTable(
      "subjectiveEffects",
      api.subjectiveEffects.getAll,
      api.subjectiveEffects.bulkImport,
      { argName: "effects" }
    ));
  }

  // Sync effectIndexArticles
  if (shouldSync("effectIndexArticles")) {
    results.push(await syncTable(
      "effectIndexArticles",
      api.effectIndexArticles.getAll,
      api.effectIndexArticles.bulkImport,
      { argName: "articles", requiresAuth: true }
    ));
  }

  // Sync prompts (requires auth)
  if (shouldSync("prompts")) {
    results.push(await syncTable(
      "prompts",
      api.prompts.getAll,
      api.prompts.bulkImport,
      { argName: "prompts", requiresAuth: true }
    ));
  }

  // Sync quotes (requires auth)
  if (shouldSync("quotes")) {
    results.push(await syncTable(
      "quotes",
      api.quotes.getAll,
      api.quotes.bulkImport,
      { argName: "quotes", requiresAuth: true }
    ));
  }

  if (shouldSync("articleSources")) {
    console.log("\n📦 Syncing articleSources...");
    console.log(
      `   ⏭️  Skipping bulk sync (article source documents may exceed ${Math.round(ARTICLE_SOURCE_DOCUMENT_MAX_BYTES / 1024 / 1024)}MB - use migrate-sources-to-data.mjs)`,
    );
  }

  // Sync replications (metadata only - storage IDs won't resolve in prod)
  if (shouldSync("replications")) {
    results.push(await syncTable(
      "replications",
      api.replications.getAll,
      api.replications.bulkImport,
      { argName: "replications" }
    ));
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Sync Complete\n");

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const result of results) {
    const status = result.errors.length > 0 ? "⚠️" : "✅";
    console.log(`${status} ${result.table}: ${result.created} created, ${result.updated} updated`);
    totalCreated += result.created;
    totalUpdated += result.updated;
    totalErrors += result.errors.length;
  }

  console.log("\n" + "-".repeat(40));
  console.log(`Total: ${totalCreated} created, ${totalUpdated} updated, ${totalErrors} errors`);

  // Update audit log with results
  updateAuditLog(auditLogPath, {
    result: {
      totalCreated,
      totalUpdated,
      totalErrors,
      tables: results.map((r) => ({
        table: r.table,
        created: r.created,
        updated: r.updated,
        errorCount: r.errors.length,
      })),
    },
    status: totalErrors > 0 ? "completed_with_errors" : "completed",
  });

  if (totalErrors > 0) {
    console.log("\n⚠️  Some errors occurred. Check output above for details.");
  } else {
    console.log("\n✨ All data synced successfully!");
  }
}

main().catch((error) => {
  console.error("❌ Sync failed:", error);
  process.exit(1);
});
