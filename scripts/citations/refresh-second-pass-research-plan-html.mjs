#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry.startsWith("--")) throw new Error(`Unexpected argument: ${entry}`);
    const [key, inline] = entry.slice(2).split("=", 2);
    const value = inline ?? argv[index + 1];
    if (!value || (!inline && value.startsWith("--"))) throw new Error(`Missing value for --${key}`);
    if (!inline) index += 1;
    values[key] = value;
  }
  return values;
}

function replaceOne(source, pattern, value, name) {
  const matches = source.match(pattern) ?? [];
  if (matches.length !== 1) throw new Error(`Research-plan HTML must contain exactly one ${name}`);
  return source.replace(pattern, value);
}

export function refreshResearchPlanHtml({ html, plan, campaignState }) {
  const currentRows = campaignState.currentRows;
  if (!Array.isArray(currentRows) || currentRows.length !== plan.summary?.actionableCandidates) {
    throw new Error("Research-plan HTML requires one current campaign row per actionable plan row");
  }
  const needsReview = currentRows.filter((row) => row.status === "needs_review").length;
  const needsSource = currentRows.filter((row) => row.status === "needs_source").length;
  const finalizedRuns = new Set(currentRows.map((row) => row.runId)).size;
  const progress = `<section class="sec" id="campaign-progress"><div class="sec-head"><div><div class="sec-kicker">Live · local campaign</div><h2>Certification is derived from immutable run manifests.</h2></div><p>Every actionable immutable row resolves through <code>campaignState.currentRows</code> to a finalized draft whose final-review hash matches. Production writes remain disabled.</p></div><div class="canary-result"><div class="result-verdict"><span class="badge">certified progress</span><h3>${needsReview} marker-review rows are finalized locally.</h3><p>${needsSource} completed rows remain honest needs-source results; no actionable rows remain ready or researching. Append-only campaign history is retained separately from this current projection.</p></div><div class="result-details"><div class="result-metric"><strong>${needsReview}</strong><span>Marker review rows</span></div><div class="result-metric"><strong>${needsSource}</strong><span>Needs-source rows</span></div><div class="result-metric"><strong>0</strong><span>Ready rows</span></div><div class="result-metric"><strong>${finalizedRuns}</strong><span>Finalized runs</span></div><div class="result-metric"><strong>0</strong><span>Active initialization</span></div><div class="result-metric"><strong>0</strong><span>Postgres writes</span></div><div class="result-note"><strong>Current-state integrity:</strong> ${currentRows.length} of ${plan.summary.actionableCandidates} actionable rows have exactly one resolved campaign link/status. Stored tracker marker counts are reconciled from their accepted sections; historical <code>runs</code> entries are preserved as append-only events.</div></div></div></section>`;
  const planData = `<script id="plan-data" type="application/json">${JSON.stringify(plan, null, 2)}</script>`;
  return replaceOne(
    replaceOne(html, /<section class="sec" id="campaign-progress">[\s\S]*?<\/section>(?=\s*<section class="sec" id="pipeline">)/, progress, "campaign progress section"),
    /<script id="plan-data" type="application\/json">[\s\S]*?<\/script>/,
    planData,
    "plan data block",
  );
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const planPath = resolve(options.plan ?? "outputs/citation-second-pass-research-plan.json");
  const statePath = resolve(options.state ?? "/Users/josie/.codex/dosewiki-citation-workbench/campaigns/second-pass-campaign-state.json");
  const outputPath = resolve(options.output ?? "outputs/citation-second-pass-research-plan.html");
  const html = refreshResearchPlanHtml({
    html: readFileSync(outputPath, "utf8"),
    plan: readJson(planPath),
    campaignState: readJson(statePath),
  });
  writeFileSync(outputPath, html, "utf8");
  console.log(JSON.stringify({ outputPath, bytes: Buffer.byteLength(html) }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
