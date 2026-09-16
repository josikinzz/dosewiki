#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts";
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import { normalizePharmacologySection } from "../../lib/article/normalization.mjs";
import { sanitizeObjectKeys, stripDataMetadata } from "../batch/summary/articles.mjs";
import { normalizeArticleForRouteEquivalenceSave } from "./route-equivalence-fill.mjs";
import { assertDataOpsWriteAllowed,
backupBeforeWrite,
batchAndApplyMutations,
createDataOpsRunContext,
printDataOpsRunContext,
requireAdminIntentToken,
requireSourceUrl,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONFIRMATION_FLAG = "--confirm-plagiarism-rewrite";
const DEFAULT_WORKLIST_PATH = path.join(
  repoRoot,
  "docs/audits/dose-table-tolerance-plagiarism-rewrite-worklist.json",
);
const DEFAULT_PROPOSALS_PATH = path.join(
  repoRoot,
  "docs/audits/dose-table-tolerance-plagiarism-rewrite-proposals.json",
);
const DEFAULT_REPORT_JSON_PATH = path.join(
  repoRoot,
  "docs/audits/dose-table-tolerance-plagiarism-rewrite-apply-plan.json",
);
const DEFAULT_REPORT_MARKDOWN_PATH = path.join(
  repoRoot,
  "docs/audits/dose-table-tolerance-plagiarism-rewrite-apply-plan.md",
);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [rawKey, inlineValue] = arg.slice(2).split("=");
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const value = inlineValue ?? (argv[index + 1]?.startsWith("--") ? "true" : argv[++index] ?? "true");
    args[key] = value;
  }
  return args;
}

function parseCsv(value) {
  return value ? value.split(",").map((entry) => entry.trim()).filter(Boolean) : null;
}

function parsePositiveInteger(value, fallback) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, got: ${value}`);
  }
  return parsed;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeArtifact(filePath, contents) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function pathParts(fieldPath) {
  return [...fieldPath.matchAll(/([^.[\]]+)|\[(\d+)\]|\["((?:\\.|[^"])*)"\]/g)].map((match) => {
    if (match[1] !== undefined) return match[1];
    if (match[2] !== undefined) return Number(match[2]);
    return JSON.parse(`"${match[3]}"`);
  });
}

export function getByPath(value, fieldPath) {
  return pathParts(fieldPath).reduce((current, part) => current?.[part], value);
}

export function setByPath(value, fieldPath, nextValue) {
  const parts = pathParts(fieldPath);
  if (parts.length === 0) {
    throw new Error(`Invalid field path: ${fieldPath}`);
  }

  let current = value;
  for (const part of parts.slice(0, -1)) {
    if (current?.[part] === undefined || current?.[part] === null) {
      throw new Error(`Cannot set missing path segment ${String(part)} in ${fieldPath}`);
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = nextValue;
}

function normalizeComparableText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getString(value) {
  return typeof value === "string" ? value : "";
}

function getStringArray(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

function getArticleSlug(article) {
  return article?.slug ?? String(article?.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function mergeRewriteInputs({ worklist, proposals, slugs }) {
  const workItems = worklist.workItems ?? [];
  const proposalItems = proposals.proposals ?? [];
  const byProposalId = new Map(proposalItems.map((proposal) => [proposal.id, proposal]));
  const wantedSlugs = slugs ? new Set(slugs) : null;
  const rewrites = [];
  const errors = [];

  for (const item of workItems) {
    if (wantedSlugs && !wantedSlugs.has(item.slug)) continue;
    const proposal = byProposalId.get(item.id);
    if (!proposal) {
      errors.push(`Missing proposal for ${item.id}`);
      continue;
    }
    if (proposal.slug !== item.slug) {
      errors.push(`${item.id}: proposal slug ${proposal.slug} does not match worklist slug ${item.slug}`);
    }
    if (proposal.fieldPath !== item.fieldPath) {
      errors.push(`${item.id}: proposal fieldPath ${proposal.fieldPath} does not match ${item.fieldPath}`);
    }
    if (typeof proposal.replacementValue !== "string" || !proposal.replacementValue.trim()) {
      errors.push(`${item.id}: replacementValue must be a non-empty string`);
    }

    rewrites.push({
      ...item,
      replacementValue: proposal.replacementValue,
      rationale: proposal.rationale ?? "",
    });
  }

  const selectedIds = new Set(rewrites.map((rewrite) => rewrite.id));
  for (const proposal of proposalItems) {
    if (wantedSlugs && !wantedSlugs.has(proposal.slug)) continue;
    if (!selectedIds.has(proposal.id)) {
      errors.push(`Proposal ${proposal.id} has no matching worklist item`);
    }
  }

  return { rewrites, errors };
}

export function buildRewritePlan({ articles, worklist, proposals, slugs = null }) {
  const { rewrites, errors } = mergeRewriteInputs({ worklist, proposals, slugs });
  const articlesBySlug = new Map(articles.map((article) => [getArticleSlug(article), article]));
  const nextArticlesBySlug = new Map();
  const changes = [];

  for (const rewrite of rewrites) {
    const baseArticle = articlesBySlug.get(rewrite.slug);
    if (!baseArticle) {
      errors.push(`${rewrite.id}: live article ${rewrite.slug} was not found`);
      continue;
    }

    const currentValue = getByPath(baseArticle, rewrite.fieldPath);
    const currentText = normalizeComparableText(currentValue);
    const expectedText = normalizeComparableText(rewrite.currentValue);
    const replacementText = normalizeComparableText(rewrite.replacementValue);

    if (currentText !== expectedText) {
      if (currentText === replacementText) {
        changes.push({
          ...rewrite,
          previousValue: currentText,
          nextValue: rewrite.replacementValue,
          status: "already_applied",
        });
      } else {
        errors.push(`${rewrite.id}: live field no longer matches audited current value`);
      }
      continue;
    }

    const nextArticle = nextArticlesBySlug.get(rewrite.slug) ?? cloneJson(stripDataMetadata(baseArticle));
    setByPath(nextArticle, rewrite.fieldPath, rewrite.replacementValue);
    nextArticlesBySlug.set(rewrite.slug, nextArticle);
    changes.push({
      ...rewrite,
      previousValue: currentText,
      nextValue: rewrite.replacementValue,
      status: "pending",
    });
  }

  return {
    summary: {
      requestedRewriteCount: rewrites.length,
      pendingChangeCount: changes.filter((change) => change.status === "pending").length,
      alreadyAppliedCount: changes.filter((change) => change.status === "already_applied").length,
      affectedArticleCount: nextArticlesBySlug.size,
      errorCount: errors.length,
    },
    changes,
    affectedArticles: [...nextArticlesBySlug.values()].sort((left, right) =>
      getArticleSlug(left).localeCompare(getArticleSlug(right)),
    ),
    errors,
  };
}

export function normalizeArticleForPlagiarismRewriteSave(article) {
  const nextArticle = normalizeArticleForRouteEquivalenceSave(cloneJson(article));

  nextArticle.identification = normalizeIdentificationForSave(nextArticle.identification);
  nextArticle.classification = normalizeClassificationForSave(nextArticle.classification);
  nextArticle.subjective_effects = normalizeSubjectiveEffectsContainerForSave(nextArticle.subjective_effects);
  nextArticle.pharmacology = normalizePharmacologyForSave(nextArticle.pharmacology);
  nextArticle.reagent_testing = isRecord(nextArticle.reagent_testing) ? nextArticle.reagent_testing : {};
  nextArticle.tolerance = normalizeToleranceForSave(nextArticle.tolerance);
  nextArticle.references = Array.isArray(nextArticle.references) ? nextArticle.references : [];
  nextArticle.citations = Array.isArray(nextArticle.citations) ? nextArticle.citations : [];

  return nextArticle;
}

function normalizeIdentificationForSave(value) {
  const identification = isRecord(value) ? value : {};
  return {
    ...identification,
    common_name: getString(identification.common_name),
    substitutive_name: getString(identification.substitutive_name),
    iupac_name: getString(identification.iupac_name),
    alternative_names: getStringArray(identification.alternative_names),
    smiles: getString(identification.smiles),
    inchi_key: getString(identification.inchi_key),
    cas_number: getString(identification.cas_number),
    molecular_formula: getString(identification.molecular_formula),
    molecular_weight: getString(identification.molecular_weight),
    skeletal_structure_image: getString(identification.skeletal_structure_image),
    botanical_name:
      typeof identification.botanical_name === "string" || identification.botanical_name === null
        ? identification.botanical_name
        : "",
  };
}

function normalizeClassificationForSave(value) {
  const classification = isRecord(value) ? value : {};
  return {
    ...classification,
    psychoactive_class: getStringArray(classification.psychoactive_class),
    chemical_class: getStringArray(classification.chemical_class),
  };
}

function emptySenseCategory() {
  return { note: "", subcategories: {} };
}

function emptySubjectiveEffects() {
  return {
    notes: { overview: "", sensory: "", cognitive: "", physical: "" },
    sensory: {
      visual: emptySenseCategory(),
      auditory: emptySenseCategory(),
      tactile: emptySenseCategory(),
      olfactory: emptySenseCategory(),
      gustatory: emptySenseCategory(),
      multisensory: emptySenseCategory(),
    },
    cognitive: {},
    physical: {},
  };
}

function normalizeSubjectiveEffectsContainerForSave(value) {
  if (!isRecord(value)) return emptySubjectiveEffects();
  const fallback = emptySubjectiveEffects();
  const sensory = isRecord(value.sensory) ? value.sensory : {};
  return {
    ...value,
    notes: isRecord(value.notes)
      ? {
          overview: getString(value.notes.overview),
          sensory: getString(value.notes.sensory),
          cognitive: getString(value.notes.cognitive),
          physical: getString(value.notes.physical),
        }
      : fallback.notes,
    sensory: {
      visual: isRecord(sensory.visual) ? sensory.visual : fallback.sensory.visual,
      auditory: isRecord(sensory.auditory) ? sensory.auditory : fallback.sensory.auditory,
      tactile: isRecord(sensory.tactile) ? sensory.tactile : fallback.sensory.tactile,
      olfactory: isRecord(sensory.olfactory) ? sensory.olfactory : fallback.sensory.olfactory,
      gustatory: isRecord(sensory.gustatory) ? sensory.gustatory : fallback.sensory.gustatory,
      multisensory: isRecord(sensory.multisensory) ? sensory.multisensory : fallback.sensory.multisensory,
    },
    cognitive: isRecord(value.cognitive) ? value.cognitive : {},
    physical: isRecord(value.physical) ? value.physical : {},
  };
}

function normalizePharmacologyForSave(value) {
  return normalizePharmacologySection(value);
}

function normalizeToleranceForSave(value) {
  const tolerance = isRecord(value) ? value : {};
  return {
    ...tolerance,
    full_tolerance: getString(tolerance.full_tolerance),
    half_tolerance: getString(tolerance.half_tolerance),
    baseline_tolerance: getString(tolerance.baseline_tolerance),
    cross_tolerance: getStringArray(tolerance.cross_tolerance),
  };
}

function stripForDataWrite(article) {
  return sanitizeObjectKeys(stripDataMetadata(normalizeArticleForPlagiarismRewriteSave(article)));
}

function renderMarkdownReport(report, { writeMode, readKey, reportJsonPath }) {
  const lines = [];
  lines.push("# Dose Table and Tolerance Plagiarism Rewrite Apply Plan");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Mode: ${writeMode ? "write" : "dry-run"}`);
  lines.push(`Read Postgres key: ${readKey}`);
  lines.push(`JSON report: ${path.relative(repoRoot, reportJsonPath)}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Requested rewrites: ${report.summary.requestedRewriteCount}`);
  lines.push(`- Pending field changes: ${report.summary.pendingChangeCount}`);
  lines.push(`- Already applied fields: ${report.summary.alreadyAppliedCount}`);
  lines.push(`- Affected articles: ${report.summary.affectedArticleCount}`);
  lines.push(`- Errors: ${report.summary.errorCount}`);
  if (report.writeResult) {
    lines.push(`- Write updated articles: ${report.writeResult.totalUpdated}`);
    lines.push(`- Write errors: ${report.writeResult.allErrors.length}`);
  }
  if (report.backupPath) lines.push(`- Backup: ${path.relative(repoRoot, report.backupPath)}`);
  if (report.auditLogPath) lines.push(`- Audit log: ${path.relative(repoRoot, report.auditLogPath)}`);
  lines.push("");

  if (report.errors.length > 0) {
    lines.push("## Errors");
    lines.push("");
    for (const error of report.errors) lines.push(`- ${error}`);
    lines.push("");
  }

  lines.push("## Changes");
  lines.push("");
  lines.push("| Article | Field | Status | Source | Replacement |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const change of report.changes) {
    lines.push(
      [
        `${change.title} (${change.slug})`,
        change.fieldPath,
        change.status,
        change.sourceDisplayName ?? change.sourceId ?? "n/a",
        change.nextValue.replace(/\s+/g, " "),
      ]
        .map(tableCell)
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function tableCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").trim();
}

function printHelp() {
  console.log(`
Apply plagiarism-cleanup rewrites for dose table notes and tolerance fields.

Usage:
  node scripts/data-ops/apply-dose-table-tolerance-plagiarism-rewrites.mjs --dry-run
  node scripts/data-ops/apply-dose-table-tolerance-plagiarism-rewrites.mjs --write --confirm-plagiarism-rewrite

Options:
  --dry-run                         Preview only (default)
  --write                           Persist through api.substanceIndex.saveSubstances
  --confirm-plagiarism-rewrite      Required with --write
  --slug=<list>                     Limit to comma-separated slugs
  --source-url=<url>                Override read-only source Postgres URL
  --target=<url>                Override write target Postgres URL
  --worklist=<path>                 Worklist JSON from the exact-overlap audit
  --proposals=<path>                Worker proposal JSON
  --report-json=<path>              JSON apply-plan output
  --report-markdown=<path>          Markdown apply-plan output
  --batch-size=<n>                  Postgres write batch size (default: 20)
  --help, -h                        Show this help
`);
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (args.help || argv.includes("-h")) {
    printHelp();
    return;
  }

  const write = argv.includes("--write");
  if (write && argv.includes("--dry-run")) {
    throw new Error("Use either --dry-run or --write, not both.");
  }

  const envWithCliOverrides = {
    ...process.env,
    ...(args.sourceUrl ? { SOURCE_POSTGRES_URL: args.sourceUrl } : {}),
    ...(args.targetUrl ? { TARGET_POSTGRES_URL: args.targetUrl } : {}),
  };

  const runContext = createDataOpsRunContext({
    operation: "apply dose-note tolerance plagiarism rewrites",
    intent: "editorArticleWrite",
    argv,
    env: envWithCliOverrides,
    dryRunFlag: "--dry-run",
    executeFlag: "--write",
    requiresExecute: true,
    confirmationFlag: CONFIRMATION_FLAG,
    selectedTables: ["substanceIndex"],
    localArtifacts: ["docs/audits"],
    destructive: true,
  });

  if (!write) {
    runContext.dryRun = true;
    runContext.writeEnabled = false;
  }

  printDataOpsRunContext(runContext);
  console.log(`Slugs: ${args.slug ?? "all"}`);
  console.log("");

  const readUrl = write
    ? { value: requireTargetUrl(runContext, "Postgres plagiarism rewrite target URL"), key: runContext.targetUrlKey }
    : { value: requireSourceUrl(runContext, "Postgres plagiarism rewrite source URL"), key: runContext.sourceUrlKey };
  const client = createDataClient({ target: readUrl.value }).client;
  const articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);
  const worklist = readJson(path.resolve(repoRoot, args.worklist ?? DEFAULT_WORKLIST_PATH));
  const proposals = readJson(path.resolve(repoRoot, args.proposals ?? DEFAULT_PROPOSALS_PATH));
  const slugs = parseCsv(args.slug);
  const plan = buildRewritePlan({ articles, worklist, proposals, slugs });
  const reportJsonPath = path.resolve(repoRoot, args.reportJson ?? DEFAULT_REPORT_JSON_PATH);
  const reportMarkdownPath = path.resolve(repoRoot, args.reportMarkdown ?? DEFAULT_REPORT_MARKDOWN_PATH);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: write ? "write" : "dry-run",
    dataUrlKey: readUrl.key,
    worklistPath: path.relative(repoRoot, path.resolve(repoRoot, args.worklist ?? DEFAULT_WORKLIST_PATH)),
    proposalsPath: path.relative(repoRoot, path.resolve(repoRoot, args.proposals ?? DEFAULT_PROPOSALS_PATH)),
    summary: plan.summary,
    errors: plan.errors,
    changes: plan.changes,
  };

  if (plan.errors.length > 0) {
    writeArtifact(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
    writeArtifact(reportMarkdownPath, renderMarkdownReport(report, { writeMode: write, readKey: readUrl.key, reportJsonPath }));
    throw new Error(`Rewrite plan has ${plan.errors.length} error(s); no writes performed.`);
  }

  if (!write) {
    writeArtifact(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
    writeArtifact(reportMarkdownPath, renderMarkdownReport(report, { writeMode: false, readKey: readUrl.key, reportJsonPath }));
    console.log(`Report JSON: ${path.relative(repoRoot, reportJsonPath)}`);
    console.log(`Report Markdown: ${path.relative(repoRoot, reportMarkdownPath)}`);
    console.log(`No writes performed. Re-run with --write ${CONFIRMATION_FLAG} to update Postgres.`);
    return;
  }

  if (plan.affectedArticles.length === 0) {
    writeArtifact(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
    writeArtifact(reportMarkdownPath, renderMarkdownReport(report, { writeMode: true, readKey: readUrl.key, reportJsonPath }));
    console.log("No pending article changes; nothing to write.");
    return;
  }

  assertDataOpsWriteAllowed(runContext);
  const adminToken = requireAdminIntentToken("editorArticleWrite", { env: envWithCliOverrides });
  const { path: auditLogPath } = writeAuditLog({
    operation: "plagiarism-rewrite",
    intent: "editorArticleWrite",
    mutations: plan.changes
      .filter((change) => change.status === "pending")
      .map((change) => ({
        slug: change.slug,
        fieldPath: change.fieldPath,
        sourceId: change.sourceId,
        exactWordCount: change.exactWordCount,
        action: "replace-text",
      })),
  });
  const { path: backupPath, documentCount } = await backupBeforeWrite({
    sourceClient: client,
    queryAll: () => getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
    label: "plagiarism-rewrite-substanceIndex",
  });
  console.log(`Audit log: ${auditLogPath}`);
  console.log(`Backup: ${backupPath} (${documentCount} documents)`);

  const batchSize = parsePositiveInteger(args.batchSize, 20);
  const writeResult = await batchAndApplyMutations({
    items: plan.affectedArticles,
    batchSize,
    mutation: api.substanceIndex.saveSubstances,
    client,
    runContext,
    transformBatch: (batch) => ({
      apiKey: adminToken.token,
      articles: batch.map(stripForDataWrite),
    }),
    onBatchResult: (result, batchIndex, batch) => {
      console.log(
        `Batch ${batchIndex + 1}: wrote ${batch.length} article(s), updated=${result.updated ?? 0}, created=${result.created ?? 0}`,
      );
    },
  });

  const finalReport = {
    ...report,
    backupPath,
    auditLogPath,
    writeResult,
  };
  updateAuditLog(auditLogPath, {
    status: writeResult.failed ? "failed" : "completed",
    backupPath,
    reportJsonPath,
    reportMarkdownPath,
    result: writeResult,
  });
  writeArtifact(reportJsonPath, `${JSON.stringify(finalReport, null, 2)}\n`);
  writeArtifact(reportMarkdownPath, renderMarkdownReport(finalReport, { writeMode: true, readKey: readUrl.key, reportJsonPath }));

  console.log("");
  console.log("Write result");
  console.log(JSON.stringify({
    tokenSource: adminToken.source,
    affectedArticles: plan.affectedArticles.length,
    pendingChanges: plan.summary.pendingChangeCount,
    writeResult,
    backupPath,
    auditLogPath,
    reportJsonPath,
    reportMarkdownPath,
  }, null, 2));

  if (writeResult.failed) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
