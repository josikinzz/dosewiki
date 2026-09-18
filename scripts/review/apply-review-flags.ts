#!/usr/bin/env bun

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";

import { createDataClient, type DataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts"
import { SUBSTANCE_SECTION_IDS } from "../../src/schema/substance/sectionCatalog";
import { assertDataOpsWriteAllowed,
createDataOpsRunContext,
printDataOpsRunContext,
requireAdminIntentToken,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"

const OPERATION = "apply Review Flags";
const AUDIT_OPERATION = "review-flags-apply";
const CONFIRMATION_FLAG = "--confirm-review-flags";
const SEVERITIES = new Set(["major", "minor", "note"]);
const SECTION_IDS = new Set<string>(SUBSTANCE_SECTION_IDS);

export interface AgentReviewFlag {
  label: string;
  severity: "major" | "minor" | "note";
  note: string;
  section?: (typeof SUBSTANCE_SECTION_IDS)[number];
}

export interface ArticleReviewFindings {
  slug: string;
  run_id: string;
  flags: AgentReviewFlag[];
}

export interface ReviewApplyOptions {
  runId: string;
  write: boolean;
  argv: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseReviewApplyOptions(argv: string[]): ReviewApplyOptions {
  let runId = "";
  let write = false;
  const acceptedExact: Record<string, true> = { "--write": true, "--dry-run": true, "--allow-remote": true, [CONFIRMATION_FLAG]: true };
  const acceptedWithValue = ["--run-id=", "--confirm-write=", "--expected-deployment=", "--target="];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--target") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--target requires a Postgres URL.");
      continue;
    }
    if (argument.startsWith("--run-id=")) runId = argument.slice(9).trim();
    else if (argument === "--write") write = true;
    else if (!Object.hasOwn(acceptedExact, argument) && !acceptedWithValue.some((prefix) => argument.startsWith(prefix))) {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (!runId || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(runId)) {
    throw new Error("--run-id=<run-id> is required and may contain only letters, numbers, dots, underscores, and hyphens.");
  }
  if (write && argv.includes("--dry-run")) {
    throw new Error("Use either --dry-run or --write, not both.");
  }
  return { runId, write, argv };
}

function validateFlag(flag: unknown, location: string, errors: string[]): void {
  if (!isRecord(flag)) {
    errors.push(`${location} must be an object`);
    return;
  }
  if (typeof flag.label !== "string" || !/^\S+(?:\s+\S+){0,2}$/.test(flag.label.trim())) {
    errors.push(`${location}.label must contain 1–3 words`);
  }
  if (typeof flag.severity !== "string" || !SEVERITIES.has(flag.severity)) {
    errors.push(`${location}.severity must be major, minor, or note`);
  }
  if (typeof flag.note !== "string") {
    errors.push(`${location}.note must be a string`);
  }
  if (flag.section !== undefined && (typeof flag.section !== "string" || !SECTION_IDS.has(flag.section))) {
    errors.push(`${location}.section must be a canonical section id`);
  }
}

export function validateFindings(
  value: unknown,
  { filePath, expectedSlug, runId, manifestSlugs }: {
    filePath: string;
    expectedSlug: string;
    runId: string;
    manifestSlugs: Set<string>;
  },
): ArticleReviewFindings {
  const errors: string[] = [];
  if (!isRecord(value)) {
    throw new Error(`${filePath}: findings must be a JSON object`);
  }
  if (value.slug !== expectedSlug) errors.push(`slug must match filename ${expectedSlug}`);
  if (typeof value.slug !== "string" || !manifestSlugs.has(value.slug)) errors.push("slug must exist in the run manifest");
  if (value.run_id !== runId) errors.push(`run_id must equal ${runId}`);
  if (!Array.isArray(value.flags)) errors.push("flags must be an array");
  else value.flags.forEach((flag, index) => validateFlag(flag, `flags[${index}]`, errors));
  if (errors.length) throw new Error(`${filePath}: ${errors.join("; ")}`);
  return value as unknown as ArticleReviewFindings;
}

export function loadReviewApplyPlan(repoRoot: string, runId: string): ArticleReviewFindings[] {
  const runDirectory = resolve(repoRoot, "runs", runId);
  const manifestPath = resolve(runDirectory, "manifest.json");
  const findingsDirectory = resolve(runDirectory, "findings");
  if (!existsSync(manifestPath)) throw new Error(`Missing Review Run manifest: ${manifestPath}`);
  if (!existsSync(findingsDirectory)) throw new Error(`Missing findings directory: ${findingsDirectory}`);

  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid Review Run manifest ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(manifest) || manifest.runId !== runId || !Array.isArray(manifest.slugs) || manifest.slugs.some((slug) => typeof slug !== "string" || !slug)) {
    throw new Error(`Invalid Review Run manifest: expected runId ${runId} and a string slugs array`);
  }
  const manifestSlugs = new Set(manifest.slugs as string[]);
  if (manifestSlugs.size !== manifest.slugs.length) throw new Error("Invalid Review Run manifest: duplicate slugs");

  const files = readdirSync(findingsDirectory).filter((file) => file.endsWith(".json")).sort((a, b) => a.localeCompare(b, "en"));
  const fileSlugs = new Set(files.map((file) => basename(file, ".json")));
  const errors: string[] = [];
  for (const slug of manifestSlugs) {
    if (!fileSlugs.has(slug)) errors.push(`Missing findings file for manifest article: ${slug}`);
  }

  const findings: ArticleReviewFindings[] = [];
  for (const file of files) {
    const filePath = resolve(findingsDirectory, file);
    const expectedSlug = basename(file, ".json");
    try {
      const value = JSON.parse(readFileSync(filePath, "utf8"));
      findings.push(validateFindings(value, { filePath, expectedSlug, runId, manifestSlugs }));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (errors.length) throw new Error(`Review Run findings validation failed:\n- ${errors.join("\n- ")}`);
  return findings.sort((left, right) => left.slug.localeCompare(right.slug, "en"));
}

export function printReviewApplyPlan(plan: ArticleReviewFindings[], logger: Pick<Console, "log"> = console): void {
  logger.log(`Review Flag apply plan: ${plan.length} article(s)`);
  for (const findings of plan) {
    logger.log(`${findings.slug}: replace agent flags with ${findings.flags.length} flag(s)${findings.flags.length === 0 ? " (clear agent flags)" : ""}`);
    for (const flag of findings.flags) {
      logger.log(`  - [${flag.severity}] ${flag.label}${flag.section ? ` @ ${flag.section}` : ""}: ${flag.note}`);
    }
  }
}

interface ApplyDependencies {
  env?: NodeJS.ProcessEnv;
  logger?: Pick<Console, "log">;
  createClient?: (url: string) => Pick<DataClient, "mutation">;
  writeAudit?: typeof writeAuditLog;
  updateAudit?: typeof updateAuditLog;
}

export async function runReviewApply(
  options: ReviewApplyOptions,
  { env = process.env, logger = console, createClient = (url) => createDataClient({ target: url }).client, writeAudit = writeAuditLog, updateAudit = updateAuditLog }: ApplyDependencies = {},
): Promise<{ plan: ArticleReviewFindings[]; auditLogPath?: string }> {
  const context = createDataOpsRunContext({
    operation: OPERATION,
    intent: "editorArticleWrite",
    argv: options.argv,
    env,
    targetUrlKeys: ["TARGET_POSTGRES_URL"],
    dryRunFlag: "--dry-run",
    executeFlag: "--write",
    requiresExecute: true,
    confirmationFlag: CONFIRMATION_FLAG,
    selectedTables: ["substanceIndex"],
    localArtifacts: [`runs/${options.runId}/findings`],
    loadsEnvLocal: false,
    destructive: true,
  });
  if (!options.write) {
    context.dryRun = true;
    context.writeEnabled = false;
  }
  const plan = loadReviewApplyPlan(context.repoRoot, options.runId);
  printDataOpsRunContext(context, { logger });
  printReviewApplyPlan(plan, logger);
  if (!options.write) {
    logger.log(`No writes performed. Re-run with --write ${CONFIRMATION_FLAG} --confirm-write=${context.operationName} --expected-deployment=<deployment>.`);
    return { plan };
  }

  assertDataOpsWriteAllowed(context);
  const targetUrl = requireTargetUrl(context, "Postgres Review Flag target URL");
  const token = requireAdminIntentToken("editorArticleWrite", { env });
  const client = createClient(targetUrl);
  const audit = writeAudit({
    operation: AUDIT_OPERATION,
    intent: "editorArticleWrite",
    slug: options.runId,
    mutations: plan.map(({ slug, flags }) => ({ slug, action: "replace_agent_review_flags", flagCount: flags.length })),
    repoRoot: context.repoRoot,
  });
  const results: unknown[] = [];
  try {
    for (const findings of plan) {
      results.push(await client.mutation(api.substanceIndex.replaceAgentReviewFlagsForArticle, {
        apiKey: token.token,
        slug: findings.slug,
        runId: findings.run_id,
        flags: findings.flags,
      }));
    }
    updateAudit(audit.path, { status: "completed", runId: options.runId, results });
  } catch (error) {
    updateAudit(audit.path, { status: "failed", runId: options.runId, completed: results.length, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  logger.log(`Applied agent Review Flags to ${plan.length} article(s). Audit log: ${audit.path}`);
  return { plan, auditLogPath: audit.path };
}

async function main(): Promise<void> {
  const options = parseReviewApplyOptions(process.argv.slice(2));
  await runReviewApply(options);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`Review Flag apply failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
