import { requireAdminIntentToken } from "../lib/data-ops-run-context.mjs";

const PRODUCTION_SYNC_AUTH_INTENT_BY_TABLE = Object.freeze({
  substanceIndex: "editorArticleWrite",
  categoryLayout: "legacyAdmin",
  siteConfig: "editorArticleWrite",
  indexLayouts: "legacyAdmin",
  effectIndexArticles: "legacyAdmin",
  prompts: "promptMigrationWrite",
  quotes: "quoteMigrationWrite",
})

export function resolveProductionSyncCredentials({
  selectedTables = null,
  env = process.env,
} = {}) {
  const requestedTables = selectedTables ?? Object.keys(PRODUCTION_SYNC_AUTH_INTENT_BY_TABLE);
  const resolvedByIntent = new Map();
  const credentials = {};

  for (const table of requestedTables) {
    const intent = PRODUCTION_SYNC_AUTH_INTENT_BY_TABLE[table];
    if (!intent) continue;

    try {
      if (!resolvedByIntent.has(intent)) {
        resolvedByIntent.set(intent, requireAdminIntentToken(intent, { env }));
      }
      credentials[table] = resolvedByIntent.get(intent);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Missing credential for selected table ${table}: ${message}`);
    }
  }

  return credentials;
}
