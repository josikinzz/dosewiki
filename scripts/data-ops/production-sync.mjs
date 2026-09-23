/**
 * The production data sync: which tables it overwrites, how each is backed up
 * first, and the copy itself. `sync-data-to-production.mjs` is the only
 * entrypoint; it owns the write ceremony (`assertDataOpsWriteAllowed`) and the
 * process exit code.
 */

import { api } from "../../lib/postgres/runtime/api.ts";
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import { normalizeQuoteSectionId } from "../../lib/quoteSections.mjs";
import { sanitizeObjectKeys } from "../batch/summary/articles.mjs";
import { ARTICLE_SOURCE_DOCUMENT_MAX_BYTES } from "../article-source-documents/contract.mjs";
import {
  backupBeforeWrite,
  batchAndApplyMutations,
  productionOperationName,
} from "../lib/data-ops-run-context.mjs";

export const PRODUCTION_SYNC_OPERATION = "sync Postgres data to production";

const BATCH_SIZE = 20;

const single = (document) => (document ? [document] : []);

/** Every table the sync overwrites, in write order, with its full target read for the backup. */
const TABLE_BACKUP_READS = Object.freeze({
  substanceIndex: (client) => getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
  categoryLayout: async (client) => single(await client.query(api.categoryLayout.get, {})),
  siteConfig: async (client) => single(await client.query(api.siteConfig.getAbout, {})),
  indexLayouts: (client) => client.query(api.indexLayouts.getAll, {}),
  tripReports: (client) => client.query(api.tripReports.getAll, {}),
  subjectiveEffects: (client) => client.query(api.subjectiveEffects.getAll, {}),
  effectIndexArticles: (client) => client.query(api.effectIndexArticles.getAll, {}),
  prompts: (client) => client.query(api.prompts.getAll, {}),
  quotes: (client) => client.query(api.quotes.getAll, {}),
  replications: (client) => client.query(api.replications.getAll, {}),
});

export const PRODUCTION_SYNC_TABLES = Object.freeze(Object.keys(TABLE_BACKUP_READS));

/** Selected tables the sync writes; `null` selects every table. Unknown names write nothing. */
function writtenTables(selectedTables) {
  return selectedTables === null
    ? [...PRODUCTION_SYNC_TABLES]
    : selectedTables.filter((table) => Object.hasOwn(TABLE_BACKUP_READS, table));
}

export function productionSyncConfirmPhrase() {
  return productionOperationName(PRODUCTION_SYNC_OPERATION);
}

export function productionSyncUsage() {
  return [
    "Usage: bun scripts/data-ops/sync-data-to-production.mjs [--tables=a,b] \\",
    "  --write --confirm-production-sync \\",
    `  --confirm-write=${productionSyncConfirmPhrase()} \\`,
    "  --expected-deployment=<host/database>",
    `Tables: ${PRODUCTION_SYNC_TABLES.join(", ")} (default: all)`,
    "Without --write the command prints this plan and opens no connection.",
  ].join("\n");
}

/** One production backup per selected table, taken before the first write. */
export function planProductionSync(selectedTables) {
  const tables = writtenTables(selectedTables);
  return { tables, backups: tables.map((table) => ({ table, label: `${table}-production` })) };
}

function sanitize(docs) {
  return docs.map(({ _id, _creationTime, ...doc }) => doc);
}

/** Documents for tables whose bulkImport schema differs from the stored shape. */
function transformForTable(name, docs) {
  switch (name) {
    case "quotes":
      return docs.map(({ slug, section, content }) => ({
        slug,
        section: normalizeQuoteSectionId(section) ?? section,
        content,
      }));
    case "prompts":
      return docs.map(({ key, content }) => ({ key, content }));
    case "replications":
      // Metadata only; storage IDs are deployment-specific.
      return docs.map((doc) => {
        const rest = { ...doc };
        delete rest.created_at;
        return rest;
      });
    default:
      return docs;
  }
}

const BULK_TABLES = Object.freeze({
  indexLayouts: { query: api.indexLayouts.getAll, mutation: api.indexLayouts.bulkImport, argName: "layouts", requiresAuth: true },
  tripReports: { query: api.tripReports.getAll, mutation: api.tripReports.bulkImport, argName: "reports" },
  subjectiveEffects: { query: api.subjectiveEffects.getAll, mutation: api.subjectiveEffects.bulkImport, argName: "effects" },
  effectIndexArticles: { query: api.effectIndexArticles.getAll, mutation: api.effectIndexArticles.bulkImport, argName: "articles", requiresAuth: true },
  prompts: { query: api.prompts.getAll, mutation: api.prompts.bulkImport, argName: "prompts", requiresAuth: true },
  quotes: { query: api.quotes.getAll, mutation: api.quotes.bulkImport, argName: "quotes", requiresAuth: true },
  replications: { query: api.replications.getAll, mutation: api.replications.bulkImport, argName: "replications" },
});

function failure(table, error, logger, label = "Failed") {
  const message = error instanceof Error ? error.message : String(error);
  logger.log(`   ❌ ${label}: ${message}`);
  return { table, created: 0, updated: 0, errors: [message] };
}

function batchLogger(totalBatches, logger) {
  return {
    onBatchResult: (batchResult, batchIndex) => {
      const skippedText = batchResult.skipped ? `, skipped: ${batchResult.skipped}` : "";
      logger.log(`   Batch ${batchIndex + 1}/${totalBatches}: ✓ (created: ${batchResult.created}, updated: ${batchResult.updated}${skippedText})`);
    },
    onBatchError: (error, batchIndex) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.log(`   Batch ${batchIndex + 1}/${totalBatches}: ✗ Error: ${message}`);
    },
  };
}

async function syncBulkTable(name, { sourceClient, targetClient, credentials, logger }) {
  const { query, mutation, argName, requiresAuth } = BULK_TABLES[name];
  let docs;
  try {
    docs = transformForTable(name, sanitize(await sourceClient.query(query, {})));
  } catch (error) {
    return failure(name, error, logger, "Failed to fetch");
  }
  logger.log(`   Found ${docs.length} documents in source`);
  if (docs.length === 0) {
    logger.log("   ⏭️  Skipping (no data)");
    return { table: name, created: 0, updated: 0, errors: [] };
  }
  const result = await batchAndApplyMutations({
    items: docs,
    batchSize: BATCH_SIZE,
    mutation,
    transformBatch: (batch) => ({
      [argName]: batch,
      ...(requiresAuth ? { apiKey: credentials[name].token, updatedBy: "sync-script" } : {}),
    }),
    ...batchLogger(Math.ceil(docs.length / BATCH_SIZE), logger),
    client: targetClient,
    logger,
  });
  return { table: name, created: result.totalCreated, updated: result.totalUpdated, errors: result.allErrors };
}

async function syncSubstanceIndex({ sourceClient, targetClient, credentials, logger }) {
  const articles = await getAllSubstanceDocuments(sourceClient, api.substanceIndex.getFullDocumentPage);
  const sanitizedArticles = articles.map(({ _id, _creationTime, ...doc }) => sanitizeObjectKeys(doc));
  logger.log(`   Found ${sanitizedArticles.length} articles in source`);
  if (sanitizedArticles.length === 0) {
    logger.log("   ⏭️  Skipping (no data)");
    return { table: "substanceIndex", created: 0, updated: 0, errors: [] };
  }
  let skipped = 0;
  const logBatch = batchLogger(Math.ceil(sanitizedArticles.length / BATCH_SIZE), logger);
  const result = await batchAndApplyMutations({
    items: sanitizedArticles,
    batchSize: BATCH_SIZE,
    mutation: api.substanceIndex.saveSubstances,
    transformBatch: (batch) => ({ apiKey: credentials.substanceIndex.token, articles: batch }),
    onBatchResult: (batchResult, batchIndex) => {
      skipped += batchResult.skipped || 0;
      logBatch.onBatchResult(batchResult, batchIndex);
    },
    onBatchError: logBatch.onBatchError,
    client: targetClient,
    logger,
  });
  return { table: "substanceIndex", created: result.totalCreated, updated: result.totalUpdated, skipped, errors: result.allErrors };
}

async function syncCategoryLayout({ sourceClient, targetClient, credentials, logger }) {
  const layout = await sourceClient.query(api.categoryLayout.get, {});
  if (!layout) {
    logger.log("   ⏭️  Skipping (no data)");
    return { table: "categoryLayout", created: 0, updated: 0, errors: [] };
  }
  const { _id, _creationTime, ...data } = layout;
  await targetClient.mutation(api.categoryLayout.save, { ...data, apiKey: credentials.categoryLayout.token });
  logger.log("   ✓ Synced categoryLayout");
  return { table: "categoryLayout", created: 1, updated: 0, errors: [] };
}

async function syncSiteConfig({ sourceClient, targetClient, credentials, logger }) {
  const config = await sourceClient.query(api.siteConfig.getAbout, {});
  if (!config) {
    logger.log("   ⏭️  Skipping (no data)");
    return { table: "siteConfig", created: 0, updated: 0, errors: [] };
  }
  const data = { ...config };
  delete data._id;
  delete data._creationTime;
  delete data.key;
  delete data.updatedAt;
  await targetClient.mutation(api.siteConfig.saveAbout, { ...data, apiKey: credentials.siteConfig.token, updatedBy: "sync-script" });
  logger.log("   ✓ Synced siteConfig (About page)");
  return { table: "siteConfig", created: 1, updated: 0, errors: [] };
}

const SINGLE_TABLE_SYNCS = Object.freeze({
  substanceIndex: syncSubstanceIndex,
  categoryLayout: syncCategoryLayout,
  siteConfig: syncSiteConfig,
});

/**
 * Back up every selected table from the target, then copy each from the
 * source. A failed backup throws before anything is written. The returned
 * exit code is 1 when any row or batch reported an error.
 */
export async function runProductionSync({
  sourceClient,
  targetClient,
  selectedTables,
  credentials,
  backup = backupBeforeWrite,
  logger = console,
}) {
  const plan = planProductionSync(selectedTables);
  const backups = {};
  for (const { table, label } of plan.backups) {
    const { path, documentCount } = await backup({
      sourceClient: targetClient,
      queryAll: () => TABLE_BACKUP_READS[table](targetClient),
      label,
    });
    backups[table] = path;
    logger.log(`Backup ${table}: ${path} (${documentCount} documents)`);
  }

  const context = { sourceClient, targetClient, credentials, logger };
  const results = [];
  for (const table of plan.tables) {
    logger.log(`\n📦 Syncing ${table}...`);
    let result;
    try {
      result = SINGLE_TABLE_SYNCS[table]
        ? await SINGLE_TABLE_SYNCS[table](context)
        : await syncBulkTable(table, context);
    } catch (error) {
      result = failure(table, error, logger);
    }
    results.push({ ...result, backupPath: backups[table] });
  }

  if (selectedTables === null || selectedTables.includes("articleSources")) {
    logger.log("\n📦 Syncing articleSources...");
    logger.log(
      `   ⏭️  Skipping bulk sync (article source documents may exceed ${Math.round(ARTICLE_SOURCE_DOCUMENT_MAX_BYTES / 1024 / 1024)}MB - use migrate-sources-to-data.mjs)`,
    );
  }

  const totalErrors = results.reduce((count, result) => count + result.errors.length, 0);
  return { results, totalErrors, exitCode: totalErrors > 0 ? 1 : 0 };
}
