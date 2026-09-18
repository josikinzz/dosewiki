/**
 * Report unresolved native callable references in the application checkout.
 * No network requests, credentials, or deployment operations.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { collectAppCallsites } from "./data-app-callsites.mjs";
import {
  collectCheckoutInventory,
  walkSourceFiles,
} from "./data-function-inventory.mjs";

/** Where the app calls Postgres from. `src/app/api/**` and `lib/data/**` included. */
const APP_SOURCE_DIRS = ["src", "lib"]

function collectAppCallsitesFromRepo({ repoRoot, knownModules, dirs = APP_SOURCE_DIRS }) { const files = [];
for (const dir of dirs) {
  for (const absolutePath of walkSourceFiles(path.resolve(repoRoot, dir))) {
    files.push({
      filePath: path.relative(repoRoot, absolutePath),
      source: readFileSync(absolutePath, "utf8"),
    });
  }
}
return collectAppCallsites({ files, knownModules }); }

/**
 * Every function the app calls must be defined in this checkout.
 *
 * Typecheck already covers the `api.*` form. It cannot see the string form used
 * by `lib/data/publicData.reads.ts`, which is what renders the public site —
 * so this is the only static coverage those names have, and it is the part CI
 * can always enforce.
 *
 * @param {{ repoRoot: string }} input
 */
export function buildCallsiteIntegrityReport({ repoRoot }) {
  const checkout = collectCheckoutInventory({ repoRoot });
  const knownModules = new Set(checkout.map((entry) => entry.module));
  const callsites = collectAppCallsitesFromRepo({ repoRoot, knownModules });
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
    `  ${report.counts.checkout} defined in checkout   ${report.counts.callsites} called by the app`,
    "",
  ];
  listBlock(
    lines,
    "DANGLING: called by the app but not defined anywhere in this checkout:",
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

