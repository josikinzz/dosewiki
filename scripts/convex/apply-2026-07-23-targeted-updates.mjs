#!/usr/bin/env node
// Targeted one-off updates (2026-07-23), applied via saveSubstance per article:
// 1. Demote duplicate articles to low priority: fluorophenibut (dup of f-phenibut), k-2c-b (dup of bk-2c-b).
// 2. Fill deschloroketamine's empty interactions with ketamine-adapted dissociative combination guidance.
// Usage: node scripts/convex/apply-2026-07-23-targeted-updates.mjs --target-url=<url> [--write --confirm-write=apply-targeted-updates --expected-deployment=<name>]
import process from "node:process";

import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const REPO = "/Users/josie/Documents/Utilities/mindstate-portal/dosewiki";
const { ConvexHttpClient } = await import(REPO + "/node_modules/convex/dist/esm/browser/index.js");
const { api } = await import(REPO + "/convex/_generated/api.js");
const { sanitizeObjectKeys, stripConvexMetadata } = await import(REPO + "/scripts/batch/summary/articles.mjs");

const argv = process.argv.slice(2);
const command = createProductionWriteCommand({ operation: "apply-targeted-updates", argv });
const targetUrl = command.targetUrl;
const write = command.writeRequested;
if (!targetUrl) {
  console.error("Provide --target-url=<url> or TARGET_CONVEX_URL.");
  process.exit(1);
}
printProductionWriteCommand(command);

const DCK_INTERACTIONS = {
  caution: [
    "Amphetamines (No unexpected interactions, though likely to increase blood pressure but not an issue with sensible doses. Moving around on high doses of this combination may be ill advised due to risk of physical injury.)",
    "Benzodiazepines (Both substances potentiate the ataxia and sedation caused by the other and can lead to unexpected loss of consciousness at high doses. While unconscious, vomit aspiration is a risk if not placed in the recovery position.)",
    "Cocaine (No unexpected interactions, though likely to increase blood pressure but not an issue with sensible doses. Moving around on high doses of this combination may be ill advised due to risk of physical injury.)",
    "MAOIs (Little is documented for deschloroketamine specifically; MAO-B inhibitors appear to increase the potency of closely related arylcyclohexylamines such as ketamine, and caution is advised.)",
    "Pregabalin (Pregabalin and dissociatives may synergize and increase each other's negative side effects such as nausea, dizziness, and loss of consciousness. Caution is advised beyond medical dosages, and at any dosage for individuals with higher-risk seizure profiles.)",
  ],
  dangerous: [
    "Alcohol (Both substances cause ataxia and bring a very high risk of vomiting and unconsciousness. If the user falls unconscious while under the influence there is a severe risk of vomit aspiration if they are not placed in the recovery position.)",
    "Diphenhydramine (Both substances potentiate the ataxia and sedation caused by the other and can lead to unexpected loss of consciousness at high doses. While unconscious, vomit aspiration is a risk if not placed in the recovery position. Dissociatives are likely to increase DPH's deliriant effects at higher dosages and can greatly increase the risk of injury, mania, and psychosis.)",
    "GHB/GBL (Both substances cause ataxia and bring a risk of vomiting and unconsciousness. If the user falls unconscious while under the influence there is a severe risk of vomit aspiration if they are not placed in the recovery position.)",
    "Opioids (Both substances bring a risk of vomiting and unconsciousness. If the user falls unconscious while under the influence there is a severe risk of vomit aspiration if they are not placed in the recovery position.)",
    "Tramadol",
  ],
  unsafe: [],
};

const client = new ConvexHttpClient(targetUrl);
const clean = (a) => sanitizeObjectKeys(stripConvexMetadata(a));
const isEmptyInteractions = (i) =>
  !i || ["caution", "dangerous", "unsafe"].every((k) => !Array.isArray(i?.[k]) || i[k].length === 0);

const plan = [];
for (const slug of ["fluorophenibut", "k-2c-b"]) {
  const a = await client.query(api.substanceIndex.getBySlug, { slug });
  if (!a) { console.log(`MISSING ${slug}`); continue; }
  if (a.priority === "low") { console.log(`noop ${slug}: already low`); continue; }
  plan.push({ slug, change: `priority ${a.priority} -> low`, article: { ...a, priority: "low" } });
}
{
  const a = await client.query(api.substanceIndex.getBySlug, { slug: "deschloroketamine" });
  if (!a) { console.log("MISSING deschloroketamine"); }
  else if (!isEmptyInteractions(a.interactions)) { console.log("noop deschloroketamine: interactions already populated, not touching"); }
  else plan.push({ slug: "deschloroketamine", change: "fill empty interactions (5 caution / 5 dangerous)", article: { ...a, interactions: DCK_INTERACTIONS } });
}

console.log(`\nPlan (${write ? "WRITE" : "dry-run"}) against ${targetUrl}:`);
for (const p of plan) console.log(`  ${p.slug}: ${p.change}`);
if (!write) { console.log("\nDry-run only. Add the explicit production write flags to apply."); process.exit(0); }

assertProductionWriteAllowed(command);
const apiKey = requireProductionWriteCredential("editorArticleWrite").token;
for (const p of plan) {
  const result = await client.mutation(api.substanceIndex.saveSubstance, { apiKey, article: clean(p.article) });
  console.log(`  wrote ${p.slug}: updated=${result.updated}`);
}
