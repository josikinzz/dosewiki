import {
  findRepoRoot,
  getFlagValue,
  hasFlag,
  loadEnvFiles,
  requireAdminIntentToken,
} from "./data-ops-run-context.mjs";

const EXPLICIT_TARGET_ENV_VAR = "TARGET_CONVEX_URL";
const COMPATIBILITY_TARGET_ENV_VARS = Object.freeze([
  "CONVEX_URL",
  "VITE_CONVEX_URL",
  "NEXT_PUBLIC_CONVEX_URL",
]);

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

export function deploymentFingerprintFromUrl(targetUrl) {
  if (!targetUrl) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error("Production write target must be a valid HTTPS Convex URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Production write target must use HTTPS.");
  }

  const suffix = ".convex.cloud";
  if (!parsed.hostname.endsWith(suffix)) {
    throw new Error("Production write target must be a Convex deployment cloud URL.");
  }

  const fingerprint = parsed.hostname.slice(0, -suffix.length);
  if (!fingerprint || fingerprint.includes(".")) {
    throw new Error("Production write target must identify one exact Convex deployment.");
  }
  return fingerprint;
}

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

  const cliTarget = readNonEmpty(getFlagValue(argv, "--target-url"));
  const envTarget = readNonEmpty(env[EXPLICIT_TARGET_ENV_VAR]);
  const targetUrl = cliTarget ?? envTarget;
  const targetSource = cliTarget ? "--target-url" : envTarget ? EXPLICIT_TARGET_ENV_VAR : null;
  const compatibilityTargetsPresent = COMPATIBILITY_TARGET_ENV_VARS.filter((key) =>
    readNonEmpty(env[key]),
  );
  const writeRequested = hasFlag(argv, "--write");
  const explicitDryRun = hasFlag(argv, "--dry-run");

  return Object.freeze({
    operation: normalizedOperation,
    repoRoot,
    writeRequested,
    dryRun: explicitDryRun || !writeRequested,
    confirmationPhrase: readNonEmpty(getFlagValue(argv, "--confirm-write")),
    expectedDeployment: readNonEmpty(getFlagValue(argv, "--expected-deployment")),
    targetUrl,
    targetSource,
    deploymentFingerprint: deploymentFingerprintFromUrl(targetUrl),
    compatibilityTargetsPresent,
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
    throw new Error(
      `Production writes require TARGET_CONVEX_URL or --target-url.${compatibilityHint}`,
    );
  }
  if (command.confirmationPhrase !== command.operation) {
    throw new Error(
      `${command.operation} requires --confirm-write=${command.operation}.`,
    );
  }
  if (!command.expectedDeployment) {
    throw new Error(
      `${command.operation} requires --expected-deployment=${command.deploymentFingerprint}.`,
    );
  }
  if (command.expectedDeployment !== command.deploymentFingerprint) {
    throw new Error(
      `Expected deployment ${command.expectedDeployment} does not match target deployment ${command.deploymentFingerprint}.`,
    );
  }
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
  logger.log(`Mode: ${command.dryRun ? "dry-run" : "write requested"}`);
  if (command.targetUrl) {
    logger.log(
      `Target deployment: ${command.deploymentFingerprint} (${command.targetSource})`,
    );
  }
}
