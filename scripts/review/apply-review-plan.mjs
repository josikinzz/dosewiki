/**
 * Applies a reviewed-decision plan to Postgres through the repository's gated
 * write path.
 *
 * The plan is built and validated by `scripts/review/build-review-plan.ts`,
 * which resolves every review-model patch to a real storage path, checks the
 * whole document against the Zod contract, and refuses anything it cannot
 * convert without guessing. This command only writes what that plan contains.
 *
 * Dry run is the default. A production write additionally requires
 * `--write`, an explicit `TARGET_POSTGRES_URL` (or `--target`),
 * `--confirm-write=apply-review-plan`, and `--expected-deployment=<fingerprint>`.
 *
 * Usage:
 *   node scripts/review/apply-review-plan.mjs --plan outputs/review-decisions/plan.json
 *   TARGET_POSTGRES_URL=postgresql://localhost/dosewiki \
 *     node scripts/review/apply-review-plan.mjs \
 *       --plan outputs/review-decisions/plan.json \
 *       --write --confirm-write=apply-review-plan \
 *       --expected-deployment=<fingerprint>
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { assertDataOpsWriteAllowed,
backupBeforeWrite,
batchAndApplyMutations,
createDataOpsRunContext,
requireAdminIntentToken,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"

const OPERATION = "apply-review-plan";
const INTENT = "editorArticleWrite";

const runContext = createDataOpsRunContext({
  operation: OPERATION,
  intent: INTENT,
  confirmationFlag: `--confirm-write=${OPERATION}`,
});

/**
 * The run context exposes raw `argv` and the resolved write decision, not a
 * parsed flag map, so this command reads its own flags and defers the
 * write/dry-run decision to `runContext.writeEnabled`.
 */
function flagValue(name, fallback = undefined) {
  const argv = runContext.argv ?? [];
  const index = argv.indexOf(`--${name}`);
  if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--")) return argv[index + 1];
  const inline = argv.find((token) => token.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : fallback;
}

const planPath = flagValue("plan", "outputs/review-decisions/plan.json");
const reportPath = flagValue("report", "outputs/review-decisions/apply-report.md");
const write = runContext.writeEnabled;

const plan = JSON.parse(readFileSync(planPath, "utf8"));

if (plan.validationFailures?.length) {
  throw new Error(
    `plan has ${plan.validationFailures.length} validation failure(s); refusing to write. Rebuild the plan first.`,
  );
}
if (!plan.articles?.length) {
  console.log("plan contains no article changes; nothing to do.");
  process.exit(0);
}

/** Postgres bookkeeping fields are rejected by the save mutation's validator. */
function stripForDataWrite(document) {
  const { _id, _creationTime, ...rest } = document;
  return rest;
}

const changeCount = plan.articles.reduce((sum, article) => sum + article.changes.length, 0);
const recordCount = new Set(
  plan.articles.flatMap((article) => article.changes.map((change) => change.recordId)),
).size;

/** One line per field change, with a truncated before/after for eyeballing. */
function renderReport() {
  const clip = (value, limit = 220) => {
    if (value === undefined) return "(absent)";
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  };
  const lines = [
    "# Reviewed-decision apply report",
    "",
    `- Generated: ${new Date().toISOString()}`,
    `- Mode: ${write ? "WRITE" : "dry run"}`,
    `- Plan: \`${planPath}\` (built ${plan.generatedAt})`,
    `- Articles: ${plan.articles.length}`,
    `- Field changes: ${changeCount}`,
    `- Reviewed records represented: ${recordCount}`,
    `- Records the plan refused: ${new Set((plan.refusals ?? []).map((entry) => entry.recordId)).size}`,
    "",
  ];
  for (const article of plan.articles) {
    lines.push(`## ${article.slug}`, "");
    for (const change of article.changes) {
      lines.push(`- \`${change.storagePath}\` — ${change.kind} (${change.recordId})`);
      lines.push(`  - before: ${clip(change.before)}`);
      lines.push(`  - after:  ${clip(change.after)}`);
    }
    lines.push("");
  }
  if (plan.refusals?.length) {
    lines.push("## Refused, needing a human", "");
    for (const refusal of plan.refusals) {
      lines.push(`- \`${refusal.recordId}\` — ${refusal.reason}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, renderReport());
console.log(`articles       : ${plan.articles.length}`);
console.log(`field changes  : ${changeCount}`);
console.log(`records        : ${recordCount}`);
console.log(`report         : ${reportPath}`);

if (!write) {
  console.log("");
  console.log("Dry run. No writes performed. To apply:");
  console.log(
    `  TARGET_POSTGRES_URL=<url> node scripts/review/apply-review-plan.mjs --plan ${planPath} \\`,
  );
  console.log(
    `    --write --confirm-write=${OPERATION} --expected-deployment=<fingerprint>`,
  );
  process.exit(0);
}

assertDataOpsWriteAllowed(runContext);
const targetUrl = requireTargetUrl(runContext, "reviewed-decision apply target URL");
const client = createDataClient({ target: targetUrl }).client;
const adminToken = requireAdminIntentToken(INTENT, { env: process.env });

const { path: auditLogPath } = writeAuditLog({
  operation: OPERATION,
  intent: INTENT,
  mutations: plan.articles.flatMap((article) =>
    article.changes.map((change) => ({
      slug: article.slug,
      fieldPath: change.storagePath,
      recordId: change.recordId,
      action: change.kind,
    })),
  ),
});

const { path: backupPath, documentCount } = await backupBeforeWrite({
  sourceClient: client,
  queryAll: async () => {
    const documents = [];
    for (const article of plan.articles) {
      const stored = await client.query(api.substanceIndex.getBySlug, { slug: article.slug });
      if (stored) documents.push(stored);
    }
    return documents;
  },
  label: "apply-review-plan-substanceIndex",
});
console.log(`audit log      : ${auditLogPath}`);
console.log(`backup         : ${backupPath} (${documentCount} documents)`);

const writeResult = await batchAndApplyMutations({
  items: plan.articles.map((article) => article.document),
  batchSize: Number(flagValue("batchSize", "10")),
  mutation: api.substanceIndex.saveSubstances,
  client,
  runContext,
  transformBatch: (batch) => ({
    apiKey: adminToken.token,
    articles: batch.map(stripForDataWrite),
  }),
  onBatchResult: (result, batchIndex, batch) => {
    console.log(
      `batch ${batchIndex + 1}: ${batch.length} article(s), updated=${result?.updated ?? 0}, created=${result?.created ?? 0}`,
    );
  },
});

updateAuditLog(auditLogPath, {
  status: writeResult?.failed ? "failed" : "completed",
  backupPath,
  reportPath,
  result: writeResult,
});

writeFileSync(reportPath, renderReport());
console.log("");
console.log(JSON.stringify({ tokenSource: adminToken.source, writeResult }, null, 1));
