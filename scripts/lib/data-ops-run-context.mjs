import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  POSTGRES_EXPLICIT_TARGET_ENV_VAR,
  POSTGRES_FALLBACK_TARGET_ENV_VARS,
  getDataBackend,
  isPostgresTargetExplicit,
  postgresFingerprintFromUrl,
  resolvePostgresTarget,
  resolvePostgresSource,
} from "./data-client.ts";
import { parsePostgresTarget } from "../../lib/postgres/runtime/target.ts";

const POSTGRES_URL_KEYS = [
  "--target",
  POSTGRES_EXPLICIT_TARGET_ENV_VAR,
  ...POSTGRES_FALLBACK_TARGET_ENV_VARS,
];

export const POSTGRES_TARGET_URL_KEYS = [...POSTGRES_URL_KEYS];

export const POSTGRES_SOURCE_URL_KEYS = [
  "SOURCE_POSTGRES_URL",
  ...POSTGRES_TARGET_URL_KEYS,
];

const LEGACY_ADMIN_KEY_ENV_VAR = "DATA_ADMIN_KEY";

const ADMIN_INTENT_ENV_VARS = Object.freeze({
  editorArticleWrite: "DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE",
  publicIntakeCreate: "DATA_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE",
  promptMigrationWrite: "DATA_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE",
  quoteMigrationWrite: "DATA_ADMIN_TOKEN_QUOTE_MIGRATION_WRITE",
  profileMediaWrite: "DATA_ADMIN_TOKEN_PROFILE_MEDIA_WRITE",
  replicationMaintenance: "DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE",
  articleSourceMigration: "DATA_ADMIN_TOKEN_ARTICLE_SOURCE_MIGRATION",
  productionSync: "DATA_ADMIN_TOKEN_PRODUCTION_SYNC",
  citationEvidenceWrite: "DATA_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE",
  citationEvidenceReview: "DATA_ADMIN_TOKEN_CITATION_EVIDENCE_REVIEW",
  generatedPublicationWrite: "DATA_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE",
  reagentTestImport: "DATA_ADMIN_TOKEN_REAGENT_TEST_IMPORT",
});

function stripOptionalQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseEnvFileContent(content) {
  const parsed = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const withoutExport = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eqIndex = withoutExport.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = withoutExport.slice(0, eqIndex).trim();
    const value = withoutExport.slice(eqIndex + 1);
    if (key) {
      parsed[key] = stripOptionalQuotes(value);
    }
  }

  return parsed;
}

export function findRepoRoot(startDir = process.cwd()) {
  let current = resolve(startDir);

  while (true) {
    if (existsSync(resolve(current, "package.json"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return resolve(startDir);
    }
    current = parent;
  }
}

export function loadEnvFiles({
  rootDir = findRepoRoot(),
  env = process.env,
  fileNames = [".env.local"],
} = {}) {
  const loaded = {};

  for (const fileName of fileNames) {
    const envPath = resolve(rootDir, fileName);
    if (!existsSync(envPath)) {
      continue;
    }

    const parsed = parseEnvFileContent(readFileSync(envPath, "utf-8"));
    loaded[fileName] = parsed;

    for (const [key, value] of Object.entries(parsed)) {
      if (env[key] === undefined) {
        env[key] = value;
      }
    }
  }

  return loaded;
}

export function hasFlag(argv, name) {
  return argv.includes(name) || argv.some((arg) => arg.startsWith(`${name}=`));
}

export function getFlagValue(argv, name) {
  const prefix = `${name}=`;
  const arg = argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function firstEnvValue(env, keys) {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === "string" && value.trim()) {
      return { value: value.trim(), key };
    }
  }
  return { value: null, key: null };
}

function readNonEmptyEnvValue(env, key) {
  const value = env[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function confirmationPresent(argv, flagName) {
  if (!flagName) {
    return false;
  }
  const value = getFlagValue(argv, flagName);
  return argv.includes(flagName) || (typeof value === "string" && value.length > 0);
}

function productionOperationName(operation) {
  return operation
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}


/**
 * Postgres reads may select --source-url or SOURCE_POSTGRES_URL independently.
 * Writes always require an explicit --target or TARGET_POSTGRES_URL plus the
 * operation confirmation and exact host/database fingerprint.
 */
export function createDataOpsRunContext({
  operation,
  intent,
  argv = process.argv.slice(2),
  startDir = process.cwd(),
  env = process.env,
  sourceUrlKeys = POSTGRES_SOURCE_URL_KEYS,
  targetUrlKeys = POSTGRES_TARGET_URL_KEYS,
  defaultTargetUrl = null,
  dryRunFlag = "--dry-run",
  executeFlag = "--execute",
  requiresExecute = false,
  confirmationFlag = null,
  selectedTables = null,
  localArtifacts = [],
  loadsEnvLocal = true,
  destructive = false,
  allowLocalTarget = false,
} = {}) {
  if (!operation) {
    throw new Error("operation is required");
  }

  const repoRoot = findRepoRoot(startDir);
  const envFiles = loadsEnvLocal ? loadEnvFiles({ rootDir: repoRoot, env }) : {};
  const backend = getDataBackend(env);
  const dryRun = dryRunFlag ? hasFlag(argv, dryRunFlag) : false;
  const execute = executeFlag ? hasFlag(argv, executeFlag) : false;
  const writeRequested = hasFlag(argv, "--write");
  const target = resolvePostgresTarget({ argv, env });
  const resolvedSource = resolvePostgresSource({ argv, env });
  const source = sourceUrlKeys.length
    ? { value: resolvedSource.url, key: resolvedSource.source }
    : { value: null, key: null };
  const targetUrl = target.url;
  const targetUrlKey = target.source;
  const writeEnabled = !dryRun && writeRequested && (!requiresExecute || execute);
  const operationName = productionOperationName(operation);
  const targetIsLocal = false;

  return {
    operation,
    intent,
    backend,
    repoRoot,
    argv,
    envFiles,
    dryRun,
    execute,
    writeRequested,
    writeEnabled,
    destructive,
    sourceUrl: source.value,
    sourceUrlKey: source.key,
    targetUrl,
    targetUrlKey,
    selectedTables,
    localArtifacts,
    confirmationFlag,
    confirmationProvided: confirmationPresent(argv, confirmationFlag),
    operationName,
    writeConfirmationPhrase: getFlagValue(argv, "--confirm-write"),
    expectedDeployment: getFlagValue(argv, "--expected-deployment"),
    deploymentFingerprint: postgresFingerprintFromUrl(targetUrl),
    targetIsLocal,
    allowLocalTarget,
  };
}

export function printDataOpsRunContext(context, { logger = console } = {}) {
  const backendLabel = "Postgres";
  logger.log(`Data operation: ${context.operation}`);
  logger.log(`Intent: ${context.intent}`);
  logger.log(`Backend: ${backendLabel.toLowerCase()}`);
  logger.log(`Mode: ${context.dryRun ? "dry-run" : context.writeEnabled ? "write" : "read-only"}`);
  if (context.sourceUrl) {
    logger.log(`Source ${backendLabel}: ${redactUrl(context.sourceUrl)} (${context.sourceUrlKey})`);
  }
  if (context.targetUrl) {
    logger.log(
      `${context.targetIsLocal ? "Local" : "Target"} ${backendLabel}: ` +
        `${redactUrl(context.targetUrl)} (${context.targetUrlKey})`,
    );
  }
  if (context.selectedTables?.length) {
    logger.log(`Tables: ${context.selectedTables.join(", ")}`);
  }
  if (context.localArtifacts?.length) {
    logger.log(`Local artifacts: ${context.localArtifacts.join(", ")}`);
  }
}

/** Never print database credentials or connection parameters. */
function redactUrl(url) {
  return parsePostgresTarget(url).displayUrl;
}

function describeDestructivePolicy(context) {
  return [
    `operation=${context.operation}`,
    `intent=${context.intent}`,
    `source=${context.sourceUrl ? redactUrl(context.sourceUrl) : "none"}`,
    `target=${context.targetUrl ? redactUrl(context.targetUrl) : "none"}`,
    `tables=${context.selectedTables?.length ? context.selectedTables.join(",") : "all/applicable"}`,
    `localArtifacts=${context.localArtifacts?.length ? context.localArtifacts.join(",") : "none"}`,
  ].join(" ");
}

export function assertDataOpsWriteAllowed(context) {
  if (context.dryRun) {
    throw new Error(`${context.operation} is in dry-run mode; writes are blocked.`);
  }

  if (!context.writeEnabled) {
    throw new Error(`${context.operation} is not in write mode; add --write.`);
  }

  if (context.destructive && context.confirmationFlag && !context.confirmationProvided) {
    throw new Error(
      `${context.operation} requires ${context.confirmationFlag} before writing. ` +
        `Confirmation policy: ${describeDestructivePolicy(context)}`,
    );
  }


  if (!context.targetUrl) throw new Error(`${context.operation} requires an explicit Postgres target.`);
  {
    const explicitTarget = isPostgresTargetExplicit(context.targetUrlKey);
    if (!explicitTarget) {
      const required = "--target or TARGET_POSTGRES_URL";
      throw new Error(
        `${context.operation} requires ${required} for privileged writes; ` +
          `${context.targetUrlKey ?? "an ambiguous fallback"} is not allowed.`,
      );
    }
    if (context.writeConfirmationPhrase !== context.operationName) {
      throw new Error(
        `${context.operation} requires --confirm-write=${context.operationName}.`,
      );
    }
    if (!context.expectedDeployment) {
      throw new Error(
        `${context.operation} requires --expected-deployment=${context.deploymentFingerprint}.`,
      );
    }
    if (context.expectedDeployment !== context.deploymentFingerprint) {
      throw new Error(
        `Expected deployment ${context.expectedDeployment} does not match ` +
          `target deployment ${context.deploymentFingerprint}.`,
      );
    }
  }

}

export function requireTargetUrl(context, label = "Postgres target URL") {
  if (!context.targetUrl) {
    const keys = POSTGRES_URL_KEYS;
    throw new Error(`Missing ${label}. Set one of: ${keys.join(", ")}`);
  }
  return context.targetUrl;
}

export function requireSourceUrl(context, label = "Postgres source URL") {
  if (!context.sourceUrl) {
    const keys = ["--source-url", "SOURCE_POSTGRES_URL", ...POSTGRES_URL_KEYS];
    throw new Error(`Missing ${label}. Set one of: ${keys.join(", ")}`);
  }
  return context.sourceUrl;
}

export function getAdminIntentEnvVar(intent) {
  return ADMIN_INTENT_ENV_VARS[intent] ?? null;
}

export function resolveAdminIntentToken(intent, { env = process.env, allowLegacy = true } = {}) {
  const scopedEnvVar = getAdminIntentEnvVar(intent);
  const scopedToken = scopedEnvVar ? readNonEmptyEnvValue(env, scopedEnvVar) : null;

  if (scopedToken) {
    return {
      token: scopedToken,
      source: "scoped",
      envVar: scopedEnvVar,
    };
  }

  if (!allowLegacy) {
    return null;
  }

  const legacyToken = readNonEmptyEnvValue(env, LEGACY_ADMIN_KEY_ENV_VAR);
  if (!legacyToken) {
    return null;
  }

  return {
    token: legacyToken,
    source: "legacy",
    envVar: LEGACY_ADMIN_KEY_ENV_VAR,
  };
}

export function requireAdminIntentToken(intent, options = {}) {
  const resolved = resolveAdminIntentToken(intent, options);
  if (!resolved) {
    const scopedEnvVar = getAdminIntentEnvVar(intent);
    const hints = [scopedEnvVar, LEGACY_ADMIN_KEY_ENV_VAR].filter(Boolean).join(", ");
    throw new Error(`Missing admin token for ${intent}. Set one of: ${hints}`);
  }
  return resolved;
}


// -----------------------------------------------------------------------------
// Backup before write
// -----------------------------------------------------------------------------

/**
 * Create a timestamped JSON backup of data before performing a destructive write.
 *
 * @param {object} options
 * @param {object} options.sourceClient - Postgres HTTP client to fetch data from.
 * @param {Function} [options.queryGetAll] - Postgres query function returning one document or a document array.
 * @param {Function} [options.queryAll] - Optional callback that returns all documents through a bounded pagination helper.
 * @param {object} [options.queryArgs] - Optional args to pass to the query.
 * @param {string} options.label - Label for the backup (e.g., table name or operation).
 * @param {string} [options.backupDir] - Directory to write backups. Defaults to `scripts/data/backups`.
 * @param {string} [options.existingBackupPath] - Non-empty backup already verified by the caller. Skips the Postgres backup query.
 * @param {string} [options.repoRoot] - Repository root for resolving backup paths.
 * @returns {Promise<{ path: string, documentCount: number | null, reused?: boolean }>} The backup used for the write.
 */
export async function backupBeforeWrite({
  sourceClient,
  queryGetAll,
  queryAll,
  queryArgs = {},
  label,
  backupDir = null,
  existingBackupPath = null,
  repoRoot = findRepoRoot(),
} = {}) {
  if (!sourceClient) {
    throw new Error("backupBeforeWrite: sourceClient is required");
  }
  if (!queryGetAll && !queryAll) {
    throw new Error("backupBeforeWrite: queryGetAll or queryAll is required");
  }
  if (queryAll && typeof queryAll !== "function") {
    throw new Error("backupBeforeWrite: queryAll must be a function");
  }
  if (!label) {
    throw new Error("backupBeforeWrite: label is required");
  }

  if (existingBackupPath) {
    const resolvedExistingBackupPath = resolve(repoRoot, existingBackupPath);
    if (!existsSync(resolvedExistingBackupPath)) {
      throw new Error(`backupBeforeWrite: existing backup not found: ${resolvedExistingBackupPath}`);
    }
    const backupStat = statSync(resolvedExistingBackupPath);
    if (!backupStat.isFile() || backupStat.size === 0) {
      throw new Error(`backupBeforeWrite: existing backup must be a non-empty file: ${resolvedExistingBackupPath}`);
    }
    return { path: resolvedExistingBackupPath, documentCount: null, reused: true };
  }

  const resolvedBackupDir = backupDir ?? resolve(repoRoot, "scripts", "data", "backups");
  if (!existsSync(resolvedBackupDir)) {
    mkdirSync(resolvedBackupDir, { recursive: true });
  }

  const queryResult = queryAll
    ? await queryAll()
    : await sourceClient.query(queryGetAll, queryArgs);
  const documents = Array.isArray(queryResult)
    ? queryResult
    : queryResult == null
      ? []
      : [queryResult];
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safeLabel = label.replace(/[^a-z0-9_-]/gi, "_");
  const filename = `${ts}-${safeLabel}.json`;
  const outputPath = resolve(resolvedBackupDir, filename);

  const backup = {
    timestamp: new Date().toISOString(),
    label,
    documentCount: documents.length,
    documents,
  };

  writeFileSync(outputPath, JSON.stringify(backup, null, 2) + "\n");

  return { path: outputPath, documentCount: documents.length };
}

// -----------------------------------------------------------------------------
// Batch mutation helper
// -----------------------------------------------------------------------------

/**
 * Execute mutations in batches with dry-run support and error aggregation.
 *
 * @param {object} options
 * @param {Array} options.items - Array of items to process.
 * @param {number} [options.batchSize=50] - Number of items per batch.
 * @param {Function} options.mutation - Postgres mutation function to call.
 * @param {Function} [options.transformBatch] - Optional function to transform a batch before mutation.
 *        Signature: (batch, batchIndex) => mutationArgs
 * @param {Function} [options.onBatchResult] - Optional callback after each successful batch.
 *        Signature: (result, batchIndex, batch) => void
 * @param {Function} [options.onBatchError] - Optional callback after each failed batch.
 *        Signature: (error, batchIndex, batch) => void
 * @param {object} options.client - Postgres HTTP client.
 * @param {object} [options.runContext] - Data ops run context (for dry-run checks).
 * @param {object} [options.logger] - Logger with log() method. Defaults to console.
 * @returns {Promise<{ totalCreated: number, totalUpdated: number, allErrors: Array, failed: boolean }>}
 */
export async function batchAndApplyMutations({
  items,
  batchSize = 50,
  mutation,
  transformBatch = null,
  onBatchResult = null,
  onBatchError = null,
  client,
  runContext = null,
  logger = console,
} = {}) {
  if (!items || !Array.isArray(items)) {
    throw new Error("batchAndApplyMutations: items array is required");
  }
  if (!mutation) {
    throw new Error("batchAndApplyMutations: mutation is required");
  }
  if (!client) {
    throw new Error("batchAndApplyMutations: client is required");
  }

  // Respect dry-run mode from run context
  if (runContext?.dryRun) {
    const totalBatches = Math.ceil(items.length / batchSize);
    logger.log(`[DRY RUN] Would process ${items.length} items in ${totalBatches} batches of ${batchSize}`);
    return {
      totalCreated: 0,
      totalUpdated: 0,
      allErrors: [],
      failed: false,
      dryRun: true,
    };
  }

  // Check write is allowed if runContext provided
  if (runContext && !runContext.writeEnabled) {
    logger.log(`[BLOCKED] Writes not enabled. Run with appropriate flags to enable writes.`);
    return {
      totalCreated: 0,
      totalUpdated: 0,
      allErrors: ["Writes not enabled"],
      failed: true,
      dryRun: false,
    };
  }

  let totalCreated = 0;
  let totalUpdated = 0;
  const allErrors = [];
  const totalBatches = Math.ceil(items.length / batchSize);

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize);

    try {
      const mutationArgs = transformBatch
        ? transformBatch(batch, batchIndex)
        : { items: batch };

      const result = await client.mutation(mutation, mutationArgs);

      if (typeof result?.created === "number") {
        totalCreated += result.created;
      }
      if (typeof result?.updated === "number") {
        totalUpdated += result.updated;
      }
      if (Array.isArray(result?.errors)) {
        allErrors.push(...result.errors);
      }

      if (onBatchResult) {
        onBatchResult(result, batchIndex, batch);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      allErrors.push(`Batch ${batchIndex + 1}/${totalBatches}: ${msg}`);

      if (onBatchError) {
        onBatchError(error, batchIndex, batch);
      }
    }
  }

  return {
    totalCreated,
    totalUpdated,
    allErrors,
    failed: allErrors.length > 0,
    dryRun: false,
  };
}
