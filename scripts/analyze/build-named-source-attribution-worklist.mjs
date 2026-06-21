#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  const options = {
    audit: null,
    deployment: null,
    worklist: null,
    markdown: null,
  };

  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    options[match[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = match[2];
  }

  if (!options.audit) throw new Error("Provide --audit=<path>");
  if (!options.deployment) throw new Error("Provide --deployment=<label>");
  if (!options.worklist) throw new Error("Provide --worklist=<path>");
  if (!options.markdown) throw new Error("Provide --markdown=<path>");
  return options;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(path.resolve(repoRoot, filePath), "utf8"));
}

function writeArtifact(filePath, contents) {
  const absolutePath = path.resolve(repoRoot, filePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

function itemId({ deployment, slug, fieldPath }) {
  const hash = createHash("sha1").update(`${deployment}\n${slug}\n${fieldPath}`).digest("hex").slice(0, 12);
  return `named-source:${deployment}:${slug}:${hash}`;
}

function fieldRoot(fieldPath) {
  return String(fieldPath ?? "").split(/[.[\]]/, 1)[0] || "unknown";
}

function groupFindings(report, deployment) {
  const byField = new Map();
  for (const finding of report.findings ?? []) {
    const key = `${finding.slug}\n${finding.field}`;
    const existing = byField.get(key) ?? {
      id: itemId({ deployment, slug: finding.slug, fieldPath: finding.field }),
      deployment,
      slug: finding.slug,
      title: finding.title ?? null,
      section: fieldRoot(finding.field),
      fieldPath: finding.field,
      currentValue: finding.value,
      matchedPhrases: [],
      patternIds: [],
      classification: "true_public_prose_named_source_leakage",
      proposedReplacement: null,
      rationale: "Named-source attribution should be rewritten as reader-facing prose without naming the source as the speaker.",
      sourcePath: finding.sourcePath ?? null,
    };

    existing.matchedPhrases.push(finding.match);
    existing.patternIds.push(finding.patternId);
    byField.set(key, existing);
  }

  return [...byField.values()].map((item) => ({
    ...item,
    matchedPhrases: [...new Set(item.matchedPhrases)],
    patternIds: [...new Set(item.patternIds)],
  })).sort((left, right) =>
    left.slug.localeCompare(right.slug) || left.fieldPath.localeCompare(right.fieldPath),
  );
}

function buildMarkdown(worklist, worklistPath) {
  const sections = new Map();
  for (const item of worklist.workItems) {
    sections.set(item.section, (sections.get(item.section) ?? 0) + 1);
  }

  const lines = [
    "# Named Source Attribution Worklist",
    "",
    `Generated: ${worklist.generatedAt}`,
    `Deployment: ${worklist.deployment}`,
    `Audit: ${worklist.sourceAuditPath}`,
    `JSON worklist: ${worklistPath}`,
    "",
    "## Summary",
    "",
    `- Findings: ${worklist.findingCount}`,
    `- Field-level work items: ${worklist.count}`,
    `- Articles affected: ${worklist.articleCount}`,
    "",
    "## Sections",
    "",
  ];

  for (const [section, count] of [...sections].sort()) {
    lines.push(`- ${section}: ${count}`);
  }

  lines.push("", "## Work Items", "");
  for (const item of worklist.workItems) {
    lines.push(`- ${item.slug} ${item.fieldPath}: ${item.matchedPhrases.join(", ")}`);
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = readJson(options.audit);
  const workItems = groupFindings(report, options.deployment);
  const articleCount = new Set(workItems.map((item) => item.slug)).size;
  const worklist = {
    generatedAt: new Date().toISOString(),
    remediationScope: "named_source_attribution",
    deployment: options.deployment,
    sourceAuditPath: options.audit,
    findingCount: report.findingCount ?? 0,
    count: workItems.length,
    articleCount,
    workItems,
  };

  writeArtifact(options.worklist, `${JSON.stringify(worklist, null, 2)}\n`);
  writeArtifact(options.markdown, buildMarkdown(worklist, options.worklist));
  console.log(JSON.stringify({
    deployment: options.deployment,
    findingCount: worklist.findingCount,
    workItemCount: worklist.count,
    articleCount,
    worklist: options.worklist,
    markdown: options.markdown,
  }, null, 2));
}

main();
