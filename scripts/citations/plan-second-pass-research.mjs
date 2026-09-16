#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createDataOpsRunContext,
  getFlagValue,
  printDataOpsRunContext,
} from "../lib/data-ops-run-context.mjs";
import { buildSecondPassResearchPlan } from "./second-pass-research-lib.mjs";

const argv = process.argv.slice(2);
const options = {
  help: argv.includes("--help") || argv.includes("-h"),
  dryRun: argv.includes("--dry-run"),
  audit: getFlagValue(argv, "--audit") ?? "tmp/subsection-citation-audit.json",
  out: getFlagValue(argv, "--out") ?? "outputs/citation-second-pass-research-plan.json",
};

if (options.help) {
  console.log(`
Build a deterministic second-pass research plan from the public subsection audit.

Usage:
  npm run citations:plan-second-pass -- --audit=tmp/subsection-citation-audit.json
  npm run citations:plan-second-pass -- --audit=<path> --out=<path> --dry-run

This command never researches, applies citations, or writes Postgres. It excludes
tolerance and deschloroketamine, scores every remaining viable uncited public
subsection, and emits an immutable plan consumable by task export.
`);
  process.exit(0);
}

const auditPath = resolve(options.audit);
const outPath = resolve(options.out);
const runContext = createDataOpsRunContext({
  operation: "plan second-pass citation research",
  intent: "citation-second-pass-plan",
  argv,
  sourceUrlKeys: [],
  targetUrlKeys: [],
  dryRunFlag: "--dry-run",
  executeFlag: null,
  localArtifacts: [auditPath, outPath],
});
printDataOpsRunContext(runContext);

if (!existsSync(auditPath)) throw new Error(`Citation audit not found: ${auditPath}`);
const audit = JSON.parse(readFileSync(auditPath, "utf8"));
const plan = buildSecondPassResearchPlan(audit, {
  generatedAt: new Date().toISOString(),
  auditPath,
});
const datura = (audit.articles ?? []).find((entry) => entry.slug === "datura");
const daturaPlan = plan.substances.find((entry) => entry.slug === "datura");

console.log(JSON.stringify({
  output: outPath,
  ...plan.summary,
  datura: datura ? {
    pharmacologyMarkers: datura.sections?.pharmacology?.markerCount ?? 0,
    actualSecondPassSections: daturaPlan?.sections.map((entry) => entry.section) ?? [],
  } : null,
}, null, 2));

if (options.dryRun) {
  console.log("No local plan written.");
  process.exit(0);
}
writeFileSync(outPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
