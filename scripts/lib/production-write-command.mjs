import { assertDataWritesNotFrozen } from "../../lib/runtime/dataWriteFreeze.ts";
import { guardTarget } from "../postgres/targetGuard.ts";
import {
  assertDeploymentConfirmed,
  findRepoRoot,
  getFlagValue,
  hasFlag,
  loadEnvFiles,
  requireAdminIntentToken,
} from "./data-ops-run-context.mjs";
import {
  POSTGRES_FALLBACK_TARGET_ENV_VARS,
  getDataBackend,
  postgresFingerprintFromUrl,
  resolvePostgresTarget,
} from "./data-client.ts";


function readNonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validateOperation(operation) {
  if (!operation || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(operation)) {
    throw new Error(
      "Production write operation must be a lowercase, hyphen-separated identifier.",
    );
  }
  return operation;
}


/**
 * Postgres production writes require `--target` or TARGET_POSTGRES_URL.
 * Pooled/direct application variables never authorize production writes.
 * The confirmation fingerprint is `<host>/<database>`.
 */
export function createProductionWriteCommand({
  operation,
  argv = process.argv.slice(2),
  env = process.env,
  startDir = process.cwd(),
  loadsEnvLocal = true,
} = {}) {
  const normalizedOperation = validateOperation(operation);
  const repoRoot = findRepoRoot(startDir);
  if (loadsEnvLocal) {
    loadEnvFiles({ rootDir: repoRoot, env });
  }

  const backend = getDataBackend(env);
  const writeRequested = hasFlag(argv, "--write");
  const explicitDryRun = hasFlag(argv, "--dry-run");
  const base = {
    operation: normalizedOperation,
    backend,
    repoRoot,
    writeRequested,
    dryRun: explicitDryRun || !writeRequested,
    allowRemote: hasFlag(argv, "--allow-remote"),
    confirmationPhrase: readNonEmpty(getFlagValue(argv, "--confirm-write")),
    expectedDeployment: readNonEmpty(getFlagValue(argv, "--expected-deployment")),
  };

  const { url, source } = resolvePostgresTarget({ argv, env, explicitOnly: true });
  return Object.freeze({
    ...base,
    targetUrl: url,
    targetSource: source,
    deploymentFingerprint: postgresFingerprintFromUrl(url),
    compatibilityTargetsPresent: POSTGRES_FALLBACK_TARGET_ENV_VARS.filter((key) => readNonEmpty(env[key])),
  });
}

export function assertProductionWriteAllowed(command) {
  if (!command?.writeRequested) {
    throw new Error(`${command?.operation ?? "Production operation"} requires --write.`);
  }
  if (command.dryRun) {
    throw new Error("--dry-run and --write cannot be combined.");
  }
  if (!command.targetUrl || !command.targetSource) {
    const compatibilityHint = command.compatibilityTargetsPresent?.length
      ? ` Browser/compatibility variables were ignored: ${command.compatibilityTargetsPresent.join(", ")}.`
      : "";
    const required = "TARGET_POSTGRES_URL or --target";
    throw new Error(`Production writes require ${required}.${compatibilityHint}`);
  }
  assertDeploymentConfirmed({
    operation: command.operation,
    operationName: command.operation,
    confirmationPhrase: command.confirmationPhrase,
    expectedDeployment: command.expectedDeployment,
    deploymentFingerprint: command.deploymentFingerprint,
  });
}

/**
 * Every production write gate, in one order, before any pool exists: the
 * freeze, then the explicit target with its operation-named confirmation and
 * deployment fingerprint, then the remote-host guard. Returns the confirmed
 * target URL; scripts that open their own pool build it from this value and
 * never resolve a target a second time.
 */
export function authorizeProductionWrite(command, { env = process.env } = {}) {
  assertDataWritesNotFrozen(command.operation, env);
  assertProductionWriteAllowed(command);
  guardTarget(command.targetUrl, command.allowRemote, env);
  return command.targetUrl;
}

export async function executeProductionWrite(command, mutation) {
  if (command.dryRun && !command.writeRequested) {
    return { status: "dry-run", wrote: false };
  }
  assertProductionWriteAllowed(command);
  return await mutation();
}

export function requireProductionWriteCredential(intent, { env = process.env } = {}) {
  return requireAdminIntentToken(intent, { env });
}

export function printProductionWriteCommand(command, { logger = console } = {}) {
  logger.log(`Operation: ${command.operation}`);
  logger.log(`Backend: ${command.backend}`);
  logger.log(`Mode: ${command.dryRun ? "dry-run" : "write requested"}`);
  if (command.targetUrl) {
    logger.log(
      `Target deployment: ${command.deploymentFingerprint} (${command.targetSource})`,
    );
  }
}
