#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const worklistPath = path.join(repoRoot, "docs/audits/other-sections-plagiarism-remediation-worklist.json");
const auditMarkdownPath = path.join(repoRoot, "docs/audits/other-sections-plagiarism-audit.md");
const proposalDir = path.join(repoRoot, "docs/audits/other-sections-plagiarism-worker-proposals");
const trackerStart = "<!-- remediation-tracker:start -->";
const trackerEnd = "<!-- remediation-tracker:end -->";

const ids = process.argv.slice(2).filter(Boolean);
if (ids.length === 0) {
  console.error("Usage: node scripts/analyze/validate-other-sections-remediation-batch.mjs <work-item-id>...");
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function relative(filePath) {
  return path.relative(repoRoot, filePath);
}

function validateProposal({ item, proposal, proposalPath }) {
  const failures = [];
  for (const key of ["id", "slug", "fieldPath"]) {
    if (proposal[key] !== item[key]) {
      failures.push(`${item.id}: ${key} mismatch (${proposal[key]} !== ${item[key]})`);
    }
  }

  if (typeof proposal.replacementValue !== "string" || proposal.replacementValue.trim().length === 0) {
    failures.push(`${item.id}: replacementValue missing/empty`);
  }

  if (
    typeof item.matchedPhrase === "string" &&
    item.matchedPhrase.length > 0 &&
    proposal.replacementValue.includes(item.matchedPhrase)
  ) {
    failures.push(`${item.id}: replacement still contains exact matched phrase`);
  }

  if (!existsSync(proposalPath)) {
    failures.push(`${item.id}: proposal file missing`);
  }

  return failures;
}

function renderTracker(worklist) {
  const statusEntries = Object.entries(worklist.byStatus).sort(([left], [right]) => left.localeCompare(right));
  const nextPending = worklist.workItems.filter((item) => item.status === "pending").slice(0, 12);
  const proposed = worklist.byStatus.proposed || 0;
  const total = worklist.workItems.length;

  return [
    trackerStart,
    "## Remediation Tracker",
    "",
    `Updated: ${worklist.updatedAt}`,
    "",
    "Threshold policy: Erowid exact excerpts >10 words; PsychonautWiki >15 words; all other sources >20 words.",
    "",
    `Overall: ${proposed}/${total} qualifying excerpts have worker proposals validated.`,
    "",
    "| Status | Count |",
    "|---|---:|",
    ...statusEntries.map(([status, count]) => `| ${status} | ${count} |`),
    "",
    "Next pending items:",
    "",
    "| ID | Article | Field | Source | Words |",
    "|---|---|---|---|---:|",
    ...nextPending.map(
      (item) =>
        `| ${item.id} | ${item.slug} | ${item.fieldPath.replaceAll("|", "\\|")} | ${item.sourceId} | ${item.exactWordCount} |`,
    ),
    trackerEnd,
  ].join("\n");
}

const worklist = readJson(worklistPath);
const byId = new Map(worklist.workItems.map((item) => [item.id, item]));
const failures = [];

for (const id of ids) {
  const item = byId.get(id);
  if (!item) {
    failures.push(`${id}: missing from worklist`);
    continue;
  }

  const proposalPath = path.join(proposalDir, `${id}.json`);
  if (!existsSync(proposalPath)) {
    failures.push(`${id}: proposal file missing`);
    continue;
  }

  let proposal;
  try {
    proposal = readJson(proposalPath);
  } catch (error) {
    failures.push(`${id}: invalid JSON: ${error.message}`);
    continue;
  }

  const itemFailures = validateProposal({ item, proposal, proposalPath });
  failures.push(...itemFailures);

  if (itemFailures.length === 0) {
    item.status = "proposed";
    item.proposalPath = relative(proposalPath);
    item.updatedAt = new Date().toISOString();
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

worklist.byStatus = worklist.workItems.reduce((acc, item) => {
  acc[item.status] = (acc[item.status] || 0) + 1;
  return acc;
}, {});
worklist.updatedAt = new Date().toISOString();
writeFileSync(worklistPath, `${JSON.stringify(worklist, null, 2)}\n`);

const markdown = readFileSync(auditMarkdownPath, "utf8");
const start = markdown.indexOf(trackerStart);
const end = markdown.indexOf(trackerEnd);
if (start === -1 || end === -1 || end < start) {
  throw new Error("tracker block missing in audit markdown");
}

const tracker = renderTracker(worklist);
const nextMarkdown = `${markdown.slice(0, start)}${tracker}${markdown.slice(end + trackerEnd.length)}`;
writeFileSync(auditMarkdownPath, nextMarkdown);

console.log(JSON.stringify({ validated: ids.length, byStatus: worklist.byStatus }, null, 2));
