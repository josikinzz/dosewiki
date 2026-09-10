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
  const targetUrlFlag = getFlagValue(argv, "--target-url");
  const envWithCliOverrides = {
    ...env,
    ...(sourceUrlFlag ? { SOURCE_CONVEX_URL: sourceUrlFlag } : {}),
    ...(targetUrlFlag ? { TARGET_CONVEX_URL: targetUrlFlag } : {}),
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
    targetUrlKey: targetUrlFlag ? "--target-url" : context.targetUrlKey,
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
  const targetUrlFlag = getFlagValue(argv, "--target-url");
  const envWithCliOverrides = {
    ...env,
    ...(sourceUrlFlag ? { SOURCE_CONVEX_URL: sourceUrlFlag } : {}),
    ...(targetUrlFlag ? { TARGET_CONVEX_URL: targetUrlFlag } : {}),
  };
  const context = createDataOpsRunContext({
    operation,
    intent: "batch-section-proposal",
    argv,
    startDir,
    env: envWithCliOverrides,
    loadsEnvLocal,
    sourceUrlKeys: ["SOURCE_CONVEX_URL", "CONVEX_PUBLIC_READ_URL"],
    targetUrlKeys: ["TARGET_CONVEX_URL"],
    selectedTables: ["substanceIndex", "prompts", "quotes", "articleSources"],
    localArtifacts: ["notes-and-plans/exports/batch-proposals"],
  });

  return {
    ...context,
    env: envWithCliOverrides,
    sourceUrlKey: sourceUrlFlag ? "--source-url" : context.sourceUrlKey,
    targetUrlKey: targetUrlFlag ? "--target-url" : context.targetUrlKey,
  };
}

export function requireBatchSourceUrl(context) {
  return requireSourceUrl(context, "batch source Convex URL");
}

export function requireBatchProposalTargetUrl(context) {
  if (!context.targetUrl || !["--target-url", "TARGET_CONVEX_URL"].includes(context.targetUrlKey)) {
    throw new Error(
      "Missing explicit proposal target Convex URL. Set TARGET_CONVEX_URL or --target-url; browser/default/source fallbacks are not accepted.",
    );
  }
  return context.targetUrl;
}

export function requireBatchTargetUrl(context) {
  return requireTargetUrl(context, "batch target Convex URL");
}

export function createBatchTargetClient(context, { Client = BackendClient } = {}) {
  assertDataOpsWriteAllowed(context);
  return new Client(requireBatchTargetUrl(context));
}

export function requireBatchArticleWriteToken({ env = process.env } = {}) {
  return requireAdminIntentToken("editorArticleWrite", { env }).token;
}
