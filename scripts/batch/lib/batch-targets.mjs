import { BackendClient } from "../../lib/data-client.ts";

import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  getFlagValue,
  requireAdminIntentToken,
  requireSourceUrl,
  requireTargetUrl,
} from "../../lib/data-ops-run-context.mjs";

export const BATCH_ARTICLE_WRITE_SCRIPTS = Object.freeze([
  "scripts/batch/batch-generate-summary.mjs",
  "scripts/batch/batch-generate-tolerance.mjs",
  "scripts/batch/batch-generate-legality.mjs",
  "scripts/batch/batch-generate-harm-potential.mjs",
  "scripts/batch/batch-generate-history-culture.mjs",
  "scripts/batch/batch-generate-dosage-duration.mjs",
  "scripts/batch/batch-generate-pharmacology.mjs",
]);

export function createBatchTargetRunContext({
  operation,
  argv = process.argv.slice(2),
  env = process.env,
  startDir = process.cwd(),
  loadsEnvLocal = true,
} = {}) {
  const sourceUrlFlag = getFlagValue(argv, "--source-url");
  const targetUrlFlag = getFlagValue(argv, "--target");
  const envWithCliOverrides = {
    ...env,
    ...(sourceUrlFlag ? { SOURCE_POSTGRES_URL: sourceUrlFlag } : {}),
    ...(targetUrlFlag ? { TARGET_POSTGRES_URL: targetUrlFlag } : {}),
  };
  const context = createDataOpsRunContext({
    operation,
    intent: "batch-article-generation",
    argv,
    startDir,
    env: envWithCliOverrides,
    loadsEnvLocal,
    selectedTables: ["substanceIndex"],
  });

  return {
    ...context,
    env: envWithCliOverrides,
    sourceUrlKey: sourceUrlFlag ? "--source-url" : context.sourceUrlKey,
    targetUrlKey: targetUrlFlag ? "--target" : context.targetUrlKey,
  };
}

export function createBatchProposalReadContext({
  operation = "batch section proposal",
  argv = process.argv.slice(2),
  env = process.env,
  startDir = process.cwd(),
  loadsEnvLocal = true,
} = {}) {
  const sourceUrlFlag = getFlagValue(argv, "--source-url");
  const targetUrlFlag = getFlagValue(argv, "--target");
  const envWithCliOverrides = {
    ...env,
    ...(sourceUrlFlag ? { SOURCE_POSTGRES_URL: sourceUrlFlag } : {}),
    ...(targetUrlFlag ? { TARGET_POSTGRES_URL: targetUrlFlag } : {}),
  };
  const context = createDataOpsRunContext({
    operation,
    intent: "batch-section-proposal",
    argv,
    startDir,
    env: envWithCliOverrides,
    loadsEnvLocal,
    sourceUrlKeys: ["SOURCE_POSTGRES_URL"],
    targetUrlKeys: ["TARGET_POSTGRES_URL"],
    selectedTables: ["substanceIndex", "prompts", "quotes", "articleSources"],
    localArtifacts: ["notes-and-plans/exports/batch-proposals"],
  });

  return {
    ...context,
    env: envWithCliOverrides,
    sourceUrlKey: sourceUrlFlag ? "--source-url" : context.sourceUrlKey,
    targetUrlKey: targetUrlFlag ? "--target" : context.targetUrlKey,
  };
}

export function requireBatchSourceUrl(context) {
  return requireSourceUrl(context, "batch source Postgres URL");
}

export function requireBatchProposalTargetUrl(context) {
  if (!context.targetUrl || !["--target", "TARGET_POSTGRES_URL"].includes(context.targetUrlKey)) {
    throw new Error(
      "Missing explicit proposal target Postgres URL. Set TARGET_POSTGRES_URL or --target; browser/default/source fallbacks are not accepted.",
    );
  }
  return context.targetUrl;
}

function requireBatchTargetUrl(context) {
  return requireTargetUrl(context, "batch target Postgres URL");
}

export function createBatchTargetClient(context, { Client = BackendClient } = {}) {
  assertDataOpsWriteAllowed(context);
  return new Client(requireBatchTargetUrl(context));
}

export function requireBatchArticleWriteToken({ env = process.env } = {}) {
  return requireAdminIntentToken("editorArticleWrite", { env }).token;
}
