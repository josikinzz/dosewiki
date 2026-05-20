import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const CONVEX_URL_KEYS = [
  "TARGET_CONVEX_URL",
  "CONVEX_URL",
  "VITE_CONVEX_URL",
  "NEXT_PUBLIC_CONVEX_URL",
];

export const SOURCE_CONVEX_URL_KEYS = [
  "SOURCE_CONVEX_URL",
  "CONVEX_PUBLIC_READ_URL",
  "CONVEX_URL",
  "VITE_CONVEX_URL",
  "NEXT_PUBLIC_CONVEX_URL",
];

const LEGACY_ADMIN_KEY_ENV_VAR = "CONVEX_ADMIN_KEY";

const ADMIN_INTENT_ENV_VARS = Object.freeze({
  editorArticleWrite: "CONVEX_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE",
  promptMigrationWrite: "CONVEX_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE",
  quoteMigrationWrite: "CONVEX_ADMIN_TOKEN_QUOTE_MIGRATION_WRITE",
  profileMediaWrite: "CONVEX_ADMIN_TOKEN_PROFILE_MEDIA_WRITE",
  replicationMaintenance: "CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE",
  articleSourceMigration: "CONVEX_ADMIN_TOKEN_ARTICLE_SOURCE_MIGRATION",
  productionSync: "CONVEX_ADMIN_TOKEN_PRODUCTION_SYNC",
  citationEvidenceWrite: "CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE",
  citationEvidenceReview: "CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_REVIEW",
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

export function createDataOpsRunContext({
  operation,
  intent,
  argv = process.argv.slice(2),
  startDir = process.cwd(),
  env = process.env,
  sourceUrlKeys = SOURCE_CONVEX_URL_KEYS,
  targetUrlKeys = CONVEX_URL_KEYS,
  defaultTargetUrl = null,
  dryRunFlag = "--dry-run",
  executeFlag = "--execute",
  requiresExecute = false,
  confirmationFlag = null,
  selectedTables = null,
  localArtifacts = [],
  loadsEnvLocal = true,
  destructive = false,
} = {}) {
  if (!operation) {
    throw new Error("operation is required");
  }

  const repoRoot = findRepoRoot(startDir);
  const envFiles = loadsEnvLocal ? loadEnvFiles({ rootDir: repoRoot, env }) : {};
  const dryRun = dryRunFlag ? hasFlag(argv, dryRunFlag) : false;
  const execute = executeFlag ? hasFlag(argv, executeFlag) : false;
  const source = firstEnvValue(env, sourceUrlKeys);
  const target = firstEnvValue(env, targetUrlKeys);
  const targetUrl = target.value ?? defaultTargetUrl;
  const targetUrlKey = target.key ?? (defaultTargetUrl ? "default" : null);
  const writeEnabled = !dryRun && (!requiresExecute || execute);

  return {
    operation,
    intent,
    repoRoot,
    argv,
    envFiles,
    dryRun,
    execute,
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
  };
}

export function printDataOpsRunContext(context, { logger = console } = {}) {
  logger.log(`Data operation: ${context.operation}`);
  logger.log(`Intent: ${context.intent}`);
  logger.log(`Mode: ${context.dryRun ? "dry-run" : context.writeEnabled ? "write" : "read-only"}`);
  if (context.sourceUrl) {
    logger.log(`Source Convex: ${context.sourceUrl} (${context.sourceUrlKey})`);
  }
  if (context.targetUrl) {
    logger.log(`Target Convex: ${context.targetUrl} (${context.targetUrlKey})`);
  }
  if (context.selectedTables?.length) {
    logger.log(`Tables: ${context.selectedTables.join(", ")}`);
  }
  if (context.localArtifacts?.length) {
    logger.log(`Local artifacts: ${context.localArtifacts.join(", ")}`);
  }
}

export function describeDestructivePolicy(context) {
  return [
    `operation=${context.operation}`,
    `intent=${context.intent}`,
    `source=${context.sourceUrl ?? "none"}`,
    `target=${context.targetUrl ?? "none"}`,
    `tables=${context.selectedTables?.length ? context.selectedTables.join(",") : "all/applicable"}`,
    `localArtifacts=${context.localArtifacts?.length ? context.localArtifacts.join(",") : "none"}`,
  ].join(" ");
}

export function assertDataOpsWriteAllowed(context) {
  if (context.dryRun) {
    throw new Error(`${context.operation} is in dry-run mode; writes are blocked.`);
  }

  if (!context.writeEnabled) {
    throw new Error(`${context.operation} is not in write mode.`);
  }

  if (context.destructive && context.confirmationFlag && !context.confirmationProvided) {
    throw new Error(
      `${context.operation} requires ${context.confirmationFlag} before writing. ` +
        `Confirmation policy: ${describeDestructivePolicy(context)}`,
    );
  }
}

export function requireTargetUrl(context, label = "Convex target URL") {
  if (!context.targetUrl) {
    throw new Error(`Missing ${label}. Set one of: ${CONVEX_URL_KEYS.join(", ")}`);
  }
  return context.targetUrl;
}

export function requireSourceUrl(context, label = "Convex source URL") {
  if (!context.sourceUrl) {
    throw new Error(`Missing ${label}. Set one of: ${SOURCE_CONVEX_URL_KEYS.join(", ")}`);
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
