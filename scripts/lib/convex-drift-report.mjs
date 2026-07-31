/**
 * Compose the checkout inventory, the app's call sites, and a deployment's live
 * function spec into one verdict, and render it as plain text.
 *
 * Shared by `scripts/convex/check-function-drift.mjs` (which exits non-zero) and
 * `scripts/convex/doctor.mjs` (which only reports). Nothing here reaches the
 * network or touches credentials; it takes an already-fetched spec.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { collectAppCallsites } from "./convex-app-callsites.mjs";
import {
  collectCheckoutInventory,
  diffFunctionInventories,
  parseFunctionSpec,
  walkSourceFiles,
} from "./convex-function-inventory.mjs";

/** Where the app calls Convex from. `src/app/api/**` and `lib/convex/**` included. */
export const APP_SOURCE_DIRS = ["src", "lib"];

export function collectAppCallsitesFromRepo({ repoRoot, knownModules, dirs = APP_SOURCE_DIRS }) {
  const files = [];
  for (const dir of dirs) {
    for (const absolutePath of walkSourceFiles(path.resolve(repoRoot, dir))) {
      files.push({
        filePath: path.relative(repoRoot, absolutePath),
        source: readFileSync(absolutePath, "utf8"),
      });
    }
  }
  return collectAppCallsites({ files, knownModules });
}

/**
 * The half of the check that needs no deployment and therefore no credential:
 * every function the app calls must at least be defined in this checkout.
 *
 * Typecheck already covers the `api.*` form. It cannot see the string form used
 * by `lib/convex/publicData.reads.ts`, which is what renders the public site —
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
    "Convex call-site integrity — checkout only, no deployment contacted",
    `  ${report.counts.checkout} defined in checkout   ${report.counts.callsites} called by the app`,
    "",
  ];
  listBlock(
    lines,
    "DANGLING — called by the app but not defined anywhere in this checkout:",
    report.danglingCallsites,
    (entry) => `${entry.identifier}  [${entry.forms.join(",")}]  ${entry.files[0]}`,
  );
  if (report.danglingCallsites.length === 0) {
    lines.push("  Every call site resolves to a function this checkout defines.");
    lines.push("");
    lines.push(
      "  This says NOTHING about whether a deployment has them. Run with --prod for that.",
    );
  }
  return lines.join("\n");
}

/**
 * @param {{ repoRoot: string, spec: unknown }} input
 */
export function buildDriftReport({ repoRoot, spec }) {
  const checkout = collectCheckoutInventory({ repoRoot });
  const knownModules = new Set(checkout.map((entry) => entry.module));
  const callsites = collectAppCallsitesFromRepo({ repoRoot, knownModules });
  const deployment = parseFunctionSpec(spec);
  const diff = diffFunctionInventories({ checkout, deployment: deployment.functions });

  const callsitesByIdentifier = new Map(
    callsites.map((callsite) => [callsite.identifier, callsite]),
  );

  // Severity that matters: a function the checkout defines but the deployment
  // lacks is bad; one the SHIPPED APP CALLS and the deployment lacks is the
  // outage. Rank them apart so the failure names the user-visible case.
  const brokenCallsites = diff.missingFromDeployment
    .filter((entry) => callsitesByIdentifier.has(entry.identifier))
    .map((entry) => ({ ...entry, callsite: callsitesByIdentifier.get(entry.identifier) }));

  const undeployedButUncalled = diff.missingFromDeployment.filter(
    (entry) => !callsitesByIdentifier.has(entry.identifier),
  );

  // A call site pointing at a module/function the checkout no longer defines.
  // Typecheck catches the `api.*` form; it cannot see the string form used by
  // lib/convex/publicData.reads.ts, which is exactly where this can hide.
  const checkoutIdentifiers = new Set(checkout.map((entry) => entry.identifier));
  const danglingCallsites = callsites.filter(
    (callsite) => !checkoutIdentifiers.has(callsite.identifier),
  );

  return {
    deploymentName: deployment.deploymentName,
    deploymentUrl: deployment.deploymentUrl,
    counts: {
      checkout: checkout.length,
      deployment: deployment.functions.length,
      callsites: callsites.length,
    },
    brokenCallsites,
    undeployedButUncalled,
    missingFromCheckout: diff.missingFromCheckout,
    visibilityMismatches: diff.visibilityMismatches,
    danglingCallsites,
  };
}

function listBlock(lines, title, entries, render) {
  if (entries.length === 0) return;
  lines.push(`  ${title}`);
  for (const entry of entries) lines.push(`    ${render(entry)}`);
  lines.push("");
}

/**
 * @param {ReturnType<typeof buildDriftReport>} report
 * @param {{ requestedDeployment?: string|null }} [options]
 */
export function formatDriftReport(report, { requestedDeployment = null } = {}) {
  const name = report.deploymentName ?? "(unknown deployment)";
  const lines = [];

  lines.push(`Convex function drift — checkout vs deployment ${name}`);
  if (requestedDeployment && report.deploymentName && requestedDeployment !== report.deploymentName) {
    lines.push(
      `  WARNING: asked for ${requestedDeployment} but the spec came from ${report.deploymentName}.`,
    );
  }
  lines.push(
    `  ${report.counts.checkout} defined in checkout   ` +
      `${report.counts.deployment} live on deployment   ` +
      `${report.counts.callsites} called by the app`,
  );
  lines.push("");

  listBlock(
    lines,
    "BROKEN — the app calls these and the deployment does not have them:",
    report.brokenCallsites,
    (entry) =>
      `${entry.identifier}  (${entry.functionType}, ${entry.visibility})  ` +
      `called from ${entry.callsite.files[0]}` +
      (entry.callsite.files.length > 1 ? ` +${entry.callsite.files.length - 1} more` : ""),
  );

  listBlock(
    lines,
    "UNDEPLOYED — defined in the checkout, absent from the deployment, no app call site:",
    report.undeployedButUncalled,
    (entry) => `${entry.identifier}  (${entry.functionType}, ${entry.visibility})`,
  );

  listBlock(
    lines,
    "DANGLING — called by the app but not defined anywhere in this checkout:",
    report.danglingCallsites,
    (entry) => `${entry.identifier}  [${entry.forms.join(",")}]  ${entry.files[0]}`,
  );

  listBlock(
    lines,
    "AT RISK OF SILENT DELETION — live on the deployment, absent from the working tree.\n" +
      "    `convex deploy` publishes the working tree, so the next deploy drops these:",
    report.missingFromCheckout,
    (entry) => `${entry.identifier}  (${entry.functionType ?? "?"}, ${entry.visibility ?? "?"})`,
  );

  listBlock(
    lines,
    "VISIBILITY CHANGED between the checkout and the deployment:",
    report.visibilityMismatches,
    (entry) => `${entry.identifier}  checkout=${entry.checkout} deployment=${entry.deployment}`,
  );

  if (
    report.brokenCallsites.length === 0 &&
    report.undeployedButUncalled.length === 0 &&
    report.danglingCallsites.length === 0 &&
    report.missingFromCheckout.length === 0 &&
    report.visibilityMismatches.length === 0
  ) {
    lines.push(`  No drift. ${name} exposes exactly what this checkout defines.`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Failures are the directions that break someone now: a call site with no
 * function behind it, either on the deployment or in the checkout. Undeployed-
 * but-uncalled and the silent-deletion direction are warnings, because a branch
 * legitimately adds or removes functions before a deploy runs.
 */
export function driftFailures(report) {
  return [...report.brokenCallsites, ...report.danglingCallsites];
}

export function driftWarnings(report) {
  return [
    ...report.undeployedButUncalled,
    ...report.missingFromCheckout,
    ...report.visibilityMismatches,
  ];
}
