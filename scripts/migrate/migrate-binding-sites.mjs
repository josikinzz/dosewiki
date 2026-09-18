#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts"
import {
  createProductionWriteCommand,
  executeProductionWrite,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const argv = process.argv.slice(2);
const command = createProductionWriteCommand({
  operation: "migrate-binding-sites",
  argv,
});
const articlePageSize = 10;
const evidencePageSize = 50;
const pharmacologyPromptKey = "section_pharmacology";
const reviewedSuspiciousTargetKeys = new Set([
  ["3-mec", 0, "Dopamine-norepinephrine reuptake inhibitor (DNRI)"],
  ["3-meo-pcpr", 1, "Dopamine reuptake inhibitor (moderate)"],
  ["3-meo-pcpr", 2, "Serotonin reuptake inhibitor (moderate)"],
  ["3-meo-pcpr", 3, "Norepinephrine reuptake inhibitor (moderate)"],
  ["4-emc", 0, "Dopamine-norepinephrine reuptake inhibitor (DNRI)"],
  ["4-emc", 1, "Serotonin releasing agent[cite:doi-10-1016-j-euroneuro-2014-12-012]"],
  ["4-fmc", 0, "Dopamine releasing agent[cite:brandt-2014-4fmc-who-cr]"],
  ["4-fmc", 1, "Norepinephrine releasing agent[cite:brandt-2014-4fmc-who-cr]"],
  ["4-fmc", 2, "Dopamine reuptake inhibitor[cite:doi-10-3389-fphar-2019-00438]"],
  ["4-fmc", 3, "Norepinephrine reuptake inhibitor[cite:doi-10-3389-fphar-2019-00438]"],
  ["4-fmc", 4, "Serotonin releasing agent (partial)"],
  ["4-mec", 0, "Serotonin releasing agent (SERT substrate)[cite:doi-10-1038-npp-2014-325]"],
  ["4-mec", 1, "Dopamine reuptake inhibitor (DAT blocker)[cite:doi-10-1038-npp-2014-325]"],
].map((entry) => JSON.stringify(entry)));
const suspiciousTargetDisposition =
  "preserve exact legacy value; target inference or row splitting requires separate editorial evidence review";
const pharmacologyPromptContent = readFileSync(
  resolve("content/prompts/sections/pharmacology.md"),
  "utf8",
);

function flagValue(name) {
  const prefix = `${name}=`;
  return argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function sourceUrl() {
  const url = command.writeRequested
    ? command.targetUrl
    : flagValue("--source-url") ??
      process.env.SOURCE_POSTGRES_URL ??
      process.env.SOURCE_POSTGRES_URL ??
      command.targetUrl;
  if (!url) {
    throw new Error(
      "Provide --source-url or SOURCE_POSTGRES_URL for a dry run; writes require an explicit target.",
    );
  }
  return url;
}

function reportPath() {
  return resolve(flagValue("--report") ?? "tmp/binding-site-migration-report.json");
}

function writeReport(report) {
  const path = reportPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Report: ${path}`);
}

async function auditArticles(client) {
  const items = [];
  let cursor;
  do {
    const page = await client.query(api.bindingSiteMigration.auditArticlesPage, {
      cursor,
      limit: articlePageSize,
    });
    items.push(...page.items);
    cursor = page.isDone ? undefined : page.cursor;
  } while (cursor);
  return items;
}

async function auditPharmacologyPrompt(client) {
  const prompt = await client.query(api.prompts.getByKey, {
    key: pharmacologyPromptKey,
  });
  const content = typeof prompt?.content === "string" ? prompt.content : "";
  return {
    exists: Boolean(prompt),
    matchesCanonical: content === pharmacologyPromptContent,
    legacyIdentifierCount: content.split("receptor_profile").length - 1,
    legacyEntryKeyCount: content.split("- receptor:").length - 1,
  };
}

async function auditEvidence(client, apiKey) {
  const remappable = [];
  const unmappable = [];
  let cursor;
  do {
    const page = await client.query(api.bindingSiteMigration.auditEvidencePage, {
      apiKey,
      cursor,
      limit: evidencePageSize,
    });
    remappable.push(...page.remappable);
    unmappable.push(...page.unmappable);
    cursor = page.isDone ? undefined : page.cursor;
  } while (cursor);
  return { remappable, unmappable };
}

function summarizeArticles(items) {
  const byStatus = {};
  for (const item of items) {
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
  }
  const suspiciousTargets = items.flatMap((item) =>
    item.suspiciousTargets.map((target) => {
      const reviewed = reviewedSuspiciousTargetKeys.has(
        JSON.stringify([item.slug, target.index, target.target]),
      );
      return {
        slug: item.slug,
        title: item.title,
        ...target,
        reviewed,
        ...(reviewed ? { disposition: suspiciousTargetDisposition } : {}),
      };
    }),
  );
  return {
    total: items.length,
    bindingSiteEntries: items.reduce(
      (total, item) => total + item.bindingSiteCount,
      0,
    ),
    needsMigration: items.filter((item) => item.needsMigration).length,
    conflicts: items.filter((item) => item.status === "conflict"),
    invalid: items.filter(
      (item) => item.status === "invalid" || item.articleIssues.length > 0,
    ),
    suspiciousTargets,
    unreviewedSuspiciousTargets: suspiciousTargets.filter((target) => !target.reviewed),
    byStatus,
  };
}

function printAudit(articleSummary, evidenceSummary, promptSummary) {
  console.log(`Articles: ${articleSummary.total}`);
  console.log(`Binding-site entries: ${articleSummary.bindingSiteEntries}`);
  console.log(`Need migration: ${articleSummary.needsMigration}`);
  console.log(`States: ${JSON.stringify(articleSummary.byStatus)}`);
  console.log(`Conflicts: ${articleSummary.conflicts.length}`);
  console.log(`Invalid: ${articleSummary.invalid.length}`);
  console.log(`Suspicious targets with dispositions: ${articleSummary.suspiciousTargets.length}`);
  console.log(`Unreviewed suspicious targets: ${articleSummary.unreviewedSuspiciousTargets.length}`);
  console.log(
    `Pharmacology prompt canonical: ${promptSummary.matchesCanonical ? "yes" : "no"} ` +
      `(legacy identifiers: ${promptSummary.legacyIdentifierCount}, legacy entry keys: ${promptSummary.legacyEntryKeyCount})`,
  );
  if (evidenceSummary) {
    console.log(`Evidence paths to remap: ${evidenceSummary.remappable.length}`);
    console.log(`Unmappable evidence paths: ${evidenceSummary.unmappable.length}`);
  } else {
    console.log("Evidence audit: unavailable without a credential accepted by the source deployment");
  }

  for (const item of articleSummary.suspiciousTargets.slice(0, 20)) {
    console.log(`  review ${item.slug ?? item.title} [${item.index}]: ${item.target}`);
  }
}

async function migrateArticles(client, apiKey) {
  const result = {
    migrated: 0,
    alreadyCanonical: 0,
    skipped: [],
    suspiciousTargets: [],
  };
  let cursor;
  do {
    const page = await client.mutation(api.bindingSiteMigration.migrateArticlesPage, {
      apiKey,
      cursor,
      limit: articlePageSize,
    });
    result.migrated += page.migrated;
    result.alreadyCanonical += page.alreadyCanonical;
    result.skipped.push(...page.skipped);
    result.suspiciousTargets.push(...page.suspiciousTargets);
    cursor = page.isDone ? undefined : page.cursor;
    console.log(
      `Article migration: ${result.migrated} migrated, ${result.alreadyCanonical} already canonical, ${result.skipped.length} skipped`,
    );
  } while (cursor);
  return result;
}

async function migratePharmacologyPrompt(client, apiKey) {
  const before = await auditPharmacologyPrompt(client);
  if (before.matchesCanonical) {
    return { updated: false };
  }
  await client.mutation(api.prompts.save, {
    apiKey,
    key: pharmacologyPromptKey,
    content: pharmacologyPromptContent,
    updatedBy: "binding-site-migration",
  });
  return { updated: true };
}

async function migrateEvidence(client, apiKey) {
  const result = { migrated: 0, unmappable: [] };
  let cursor;
  do {
    const page = await client.mutation(api.bindingSiteMigration.migrateEvidencePage, {
      apiKey,
      cursor,
      limit: evidencePageSize,
    });
    result.migrated += page.migrated;
    result.unmappable.push(...page.unmappable);
    cursor = page.isDone ? undefined : page.cursor;
    console.log(
      `Evidence migration: ${result.migrated} migrated, ${result.unmappable.length} unmappable`,
    );
  } while (cursor);
  return result;
}

function optionalCredential(intent) {
  try {
    return requireProductionWriteCredential(intent).token;
  } catch {
    return null;
  }
}

async function main() {
  console.log("\nBinding Sites Migration");
  console.log("=".repeat(50));
  printProductionWriteCommand(command);

  const readClient = createDataClient({ target: sourceUrl() }).client;
  const articles = await auditArticles(readClient);
  const articleSummary = summarizeArticles(articles);
  const promptSummary = await auditPharmacologyPrompt(readClient);
  const dryRunCredential = optionalCredential("citationEvidenceWrite");
  let evidenceSummary = null;
  if (dryRunCredential) {
    try {
      evidenceSummary = await auditEvidence(readClient, dryRunCredential);
    } catch (error) {
      console.warn(
        `Evidence audit unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  printAudit(articleSummary, evidenceSummary, promptSummary);

  const preflight = {
    generatedAt: new Date().toISOString(),
    mode: command.dryRun ? "dry-run" : "write",
    deployment: command.deploymentFingerprint,
    articles: articleSummary,
    evidence: evidenceSummary,
    prompt: promptSummary,
  };

  if (command.dryRun) {
    writeReport({ preflight });
    return;
  }

  if (
    articleSummary.conflicts.length > 0 ||
    articleSummary.invalid.length > 0 ||
    articleSummary.unreviewedSuspiciousTargets.length > 0 ||
    (evidenceSummary?.unmappable.length ?? 0) > 0
  ) {
    writeReport({ preflight, blocked: true });
    throw new Error(
      "Migration blocked by conflicting/invalid articles, unreviewed suspicious targets, or unmappable evidence paths. Review the report; no writes were made.",
    );
  }

  await executeProductionWrite(command, async () => {
    const articleApiKey = requireProductionWriteCredential("editorArticleWrite").token;
    const evidenceApiKey = requireProductionWriteCredential("citationEvidenceWrite").token;
    const promptApiKey = requireProductionWriteCredential("promptMigrationWrite").token;
    const targetClient = createDataClient({ target: command.targetUrl }).client;
    const targetArticles = summarizeArticles(await auditArticles(targetClient));
    const targetEvidence = await auditEvidence(targetClient, evidenceApiKey);
    const targetPrompt = await auditPharmacologyPrompt(targetClient);
    if (
      targetArticles.conflicts.length > 0 ||
      targetArticles.invalid.length > 0 ||
      targetArticles.unreviewedSuspiciousTargets.length > 0 ||
      targetEvidence.unmappable.length > 0
    ) {
      writeReport({
        preflight,
        targetPreflight: { articles: targetArticles, evidence: targetEvidence, prompt: targetPrompt },
        blocked: true,
      });
      throw new Error("Target preflight found blockers; no writes were made.");
    }

    const articleMigration = await migrateArticles(targetClient, articleApiKey);
    const evidenceMigration = await migrateEvidence(targetClient, evidenceApiKey);
    const promptMigration = await migratePharmacologyPrompt(targetClient, promptApiKey);
    const verifiedArticles = summarizeArticles(await auditArticles(targetClient));
    const verifiedEvidence = await auditEvidence(targetClient, evidenceApiKey);
    const verifiedPrompt = await auditPharmacologyPrompt(targetClient);
    const verificationPassed =
      verifiedArticles.needsMigration === 0 &&
      verifiedArticles.conflicts.length === 0 &&
      verifiedArticles.invalid.length === 0 &&
      verifiedArticles.bindingSiteEntries === targetArticles.bindingSiteEntries &&
      verifiedArticles.suspiciousTargets.length === targetArticles.suspiciousTargets.length &&
      verifiedArticles.unreviewedSuspiciousTargets.length === 0 &&
      verifiedEvidence.remappable.length === 0 &&
      verifiedEvidence.unmappable.length === 0 &&
      articleMigration.skipped.length === 0 &&
      evidenceMigration.unmappable.length === 0 &&
      verifiedPrompt.matchesCanonical;

    const report = {
      preflight,
      targetPreflight: { articles: targetArticles, evidence: targetEvidence, prompt: targetPrompt },
      migration: {
        articles: articleMigration,
        evidence: evidenceMigration,
        prompt: promptMigration,
      },
      verification: {
        passed: verificationPassed,
        articles: verifiedArticles,
        evidence: verifiedEvidence,
        prompt: verifiedPrompt,
      },
    };
    writeReport(report);

    if (!verificationPassed) {
      throw new Error("Post-write verification failed; inspect the migration report.");
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
