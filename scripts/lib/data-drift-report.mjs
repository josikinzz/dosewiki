import { readFileSync } from "node:fs";
import path from "node:path";
import { collectAppCallsites } from "./data-app-callsites.mjs";
import {
  collectCheckoutInventory,
  walkSourceFiles,
} from "./data-function-inventory.mjs";

const CALLSITE_SOURCE_DIRS = ["src", "lib", "server", "scripts"];

function collectCallsitesFromRepo({ repoRoot, knownModules }) {
  const files = [];
  for (const dir of CALLSITE_SOURCE_DIRS) {
    for (const absolutePath of walkSourceFiles(path.resolve(repoRoot, dir))) {
      files.push({
        filePath: path.relative(repoRoot, absolutePath),
        source: readFileSync(absolutePath, "utf8"),
      });
    }
  }
  return collectAppCallsites({ files, knownModules });
}

export function buildCallsiteIntegrityReport({ repoRoot }) {
  const checkout = collectCheckoutInventory({ repoRoot });
  const knownModules = new Set(checkout.map((entry) => entry.module));
  const callsites = collectCallsitesFromRepo({ repoRoot, knownModules });
  const checkoutIdentifiers = new Set(checkout.map((entry) => entry.identifier));

  return {
    counts: { checkout: checkout.length, callsites: callsites.length },
    danglingCallsites: callsites.filter(
      (callsite) => !checkoutIdentifiers.has(callsite.identifier),
    ),
  };
}

export function formatCallsiteIntegrityReport(report) {
  const lines = [
    "Postgres callable integrity: checkout only, no deployment contacted",
    `  ${report.counts.checkout} defined in checkout   ${report.counts.callsites} called in src, lib, server and scripts`,
    "",
  ];
  listBlock(
    lines,
    "DANGLING: called in this checkout but not defined anywhere in it:",
    report.danglingCallsites,
    (entry) => `${entry.identifier}  [${entry.forms.join(",")}]  ${entry.files[0]}`,
  );
  if (report.danglingCallsites.length === 0) {
    lines.push("  Every call site resolves to a function this checkout defines.");
    lines.push("");
    lines.push(
      "  Deployment state requires separate artifact and runtime evidence.",
    );
  }
  return lines.join("\n");
}

function listBlock(lines, title, entries, render) {
  if (entries.length === 0) return;
  lines.push(`  ${title}`);
  for (const entry of entries) lines.push(`    ${render(entry)}`);
  lines.push("");
}

