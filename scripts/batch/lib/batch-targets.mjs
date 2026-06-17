import { ConvexHttpClient } from "convex/browser";

import {
  createDataOpsRunContext,
  getFlagValue,
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
    sourceUrlKey: sourceUrlFlag ? "--source-url" : context.sourceUrlKey,
    targetUrlKey: targetUrlFlag ? "--target-url" : context.targetUrlKey,
  };
}

export function requireBatchSourceUrl(context) {
  return requireSourceUrl(context, "batch source Convex URL");
}

export function requireBatchTargetUrl(context) {
  return requireTargetUrl(context, "batch target Convex URL");
}

export function createBatchTargetClient(context, { Client = ConvexHttpClient } = {}) {
  return new Client(requireBatchTargetUrl(context));
}
