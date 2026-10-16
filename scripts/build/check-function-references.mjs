#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCallsiteIntegrityReport, formatCallsiteIntegrityReport } from "../lib/data-drift-report.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const report = buildCallsiteIntegrityReport({ repoRoot });
console.log(process.argv.includes("--json") ? JSON.stringify(report, null, 2) : formatCallsiteIntegrityReport(report));
if (report.danglingCallsites.length > 0) {
  console.error(`FAIL: ${report.danglingCallsites.length} call site(s) name an owned function this checkout does not define.`);
  process.exitCode = 1;
}
