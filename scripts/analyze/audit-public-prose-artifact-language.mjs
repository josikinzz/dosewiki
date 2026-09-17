#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts";
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import {
  auditPublicProseArtifactLanguage,
  formatArtifactLanguageFindings,
  formatNamedSourceAttributionFindings,
} from "./public-prose-artifact-language-core.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  const options = {
    files: [],
    fail: false,
    format: "text",
    sections: [],
    sourceUrl: null,
    postgres: false,
    mode: "artifact",
    output: null,
    quiet: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target" || arg === "--source-url") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a Postgres URL.`);
      options.sourceUrl = value;
      options.postgres = true;
      continue;
    }
    if (arg === "--postgres") {
      options.postgres = true;
      continue;
    }
    if (arg === "--allow-remote") continue;
    if (arg.startsWith("--target=")) {
      options.sourceUrl = arg.slice("--target=".length);
      options.postgres = true;
      continue;
    }
    if (arg === "--fail") {
      options.fail = true;
      continue;
    }
    if (arg === "--json") {
      options.format = "json";
      continue;
    }
    if (arg.startsWith("--format=")) {
      options.format = arg.split("=")[1];
      continue;
    }
    if (arg.startsWith("--section=")) {
      options.sections.push(arg.split("=")[1]);
      continue;
    }
    if (arg.startsWith("--sections=")) {
      options.sections.push(
        ...arg.split("=")[1].split(",").map((entry) => entry.trim()).filter(Boolean),
      );
      continue;
    }
    if (arg.startsWith("--source-url=")) {
      options.sourceUrl = arg.slice("--source-url=".length);
      continue;
    }
    if (arg.startsWith("--mode=")) {
      options.mode = normalizeMode(arg.split("=")[1]);
      continue;
    }
    if (arg.startsWith("--output=")) {
      options.output = arg.split("=")[1];
      continue;
    }
    if (arg === "--named-sources") {
      options.mode = "named-source";
      continue;
    }
    if (arg === "--all-public-prose-issues") {
      options.mode = "all";
      continue;
    }
    if (arg === "--quiet") {
      options.quiet = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    options.files.push(arg);
  }

  if (options.files.length === 0 && !options.sourceUrl && !options.postgres) {
    options.files.push("public/SubstanceIndex.json");
  }

  if (!["text", "json"].includes(options.format)) {
    throw new Error(`Unsupported --format=${options.format}. Expected text or json.`);
  }

  return options;
}

function normalizeMode(value) {
  const normalized = String(value ?? "").trim().replace(/_/g, "-");
  if (["artifact", "artifact-language"].includes(normalized)) return "artifact";
  if (["named-source", "named-source-attribution", "named-sources"].includes(normalized)) {
    return "named-source";
  }
  if (normalized === "all") return "all";
  throw new Error(`Unsupported --mode=${value}. Expected artifact, named-source, or all.`);
}

function printHelp() {
  console.log(`
Audit public article prose for extraction/process artifact language or named-source attribution.

Usage:
  node scripts/analyze/audit-public-prose-artifact-language.mjs [--fail] [--json] [file...]

Options:
  --fail                 Exit non-zero when findings are present
  --json                 Print the full JSON report
  --format=text|json     Output format
  --section=<name>       Limit scan to a public section root; repeatable
  --sections=a,b         Limit scan to comma-separated public section roots
  --postgres            Audit the explicitly configured Postgres source
  --source-url=<url>     Audit Postgres substanceIndex articles from this URL
  --mode=<mode>          artifact (default), named-source, or all
  --named-sources        Alias for --mode=named-source
  --output=<path>        Write the full JSON report to a file
  --quiet                Suppress terminal report output
  --help, -h             Show help

Inputs can be SubstanceIndex-style article arrays, Postgres export objects with an
articles/substanceIndex array, proposal JSON with replacementValue fields, or
NDJSON rewrite result files with response.parsed.rewrittenText.
`);
}

function readInputFile(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Input file not found: ${filePath}`);
  }

  const content = readFileSync(absolutePath, "utf8");
  return {
    absolutePath,
    relativePath: path.relative(repoRoot, absolutePath),
    input: parseInputContent(content, filePath),
  };
}

async function readPostgresInput(sourceUrl) {
  const { client, fingerprint } = createDataClient({ target: sourceUrl ?? process.env.SOURCE_POSTGRES_URL ?? null });
  const articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);
  return {
    sourcePath: `postgres:${fingerprint}`,
    input: articles,
  };
}

function parseInputContent(content, filePath) {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }

  try {
    return JSON.parse(trimmed);
  } catch (jsonError) {
    const rows = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    try {
      return rows.map((line) => JSON.parse(line));
    } catch {
      throw new Error(`${filePath}: failed to parse as JSON or NDJSON: ${jsonError.message}`);
    }
  }
}

function mergeReports(reports) {
  const findings = reports.flatMap((report) => report.findings);
  return {
    checkedAt: new Date().toISOString(),
    mode: reports[0]?.mode ?? null,
    fileCount: reports.length,
    scannedRecordCount: reports.reduce((sum, report) => sum + report.scannedRecordCount, 0),
    scannedFieldCount: reports.reduce((sum, report) => sum + report.scannedFieldCount, 0),
    findingCount: findings.length,
    findings,
    files: reports.map((report) => ({
      sourcePath: report.sourcePath,
      scannedRecordCount: report.scannedRecordCount,
      scannedFieldCount: report.scannedFieldCount,
      findingCount: report.findingCount,
    })),
  };
}

function printReport(report, format) {
  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (report.findingCount > 0) {
    const formatter = report.mode === "named-source"
      ? formatNamedSourceAttributionFindings
      : formatArtifactLanguageFindings;
    console.error(formatter(report.findings));
    return;
  }

  console.log(JSON.stringify({
    mode: report.mode,
    findingCount: 0,
    scannedRecordCount: report.scannedRecordCount,
    scannedFieldCount: report.scannedFieldCount,
    fileCount: report.fileCount,
  }, null, 2));
}

function writeReport(report, outputPath) {
  if (!outputPath) return;
  const absolutePath = path.resolve(repoRoot, outputPath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`);
}

try {
  const options = parseArgs(process.argv.slice(2));
  const inputs = options.files.map((filePath) => {
    const { relativePath, input } = readInputFile(filePath);
    return { sourcePath: relativePath, input };
  });
  if (options.sourceUrl || options.postgres) {
    inputs.push(await readPostgresInput(options.sourceUrl));
  }
  const reports = inputs.map(({ sourcePath, input }) => {
    return auditPublicProseArtifactLanguage(input, {
      sourcePath,
      sections: options.sections,
      mode: options.mode,
    });
  });
  const report = mergeReports(reports);
  writeReport(report, options.output);
  if (!options.quiet) {
    printReport(report, options.format);
  }
  if (options.fail && report.findingCount > 0) {
    process.exit(1);
  }
} catch (error) {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
}
