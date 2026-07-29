#!/usr/bin/env node
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { planHighConfidenceDuplicateMerges } from "./lib/duplicate-merge-plan.mjs";

const command = createProductionWriteCommand({ operation: "merge-replication-unknown-twins" });
if (!command.targetUrl) throw new Error("Pass an explicit --target-url for dry runs and writes.");
printProductionWriteCommand(command);

const client = new ConvexHttpClient(command.targetUrl);
const before = await client.query(api.replications.getAll, {});
const plan = planHighConfidenceDuplicateMerges(before);
console.log(`High-confidence merges: ${plan.merges.length}`);
console.log(`Duplicate groups held for review: ${plan.review.length}`);
for (const item of plan.review) console.log(`REVIEW ${item.slug}: ${item.reason}`);

if (command.dryRun) {
  console.log("Writes: 0");
  process.exit(0);
}

assertProductionWriteAllowed(command);
const credential = requireProductionWriteCredential("replicationMaintenance");
let merged = 0;
for (const merge of plan.merges) {
  await client.mutation(api.replications.mergeUnknownTwin, {
    apiKey: credential.token,
    keeperId: merge.keeperId,
    duplicateId: merge.duplicateId,
    expectedSlug: merge.slug,
    expectedKeeperEffectSlug: merge.keeperEffectSlug,
    expectedDuplicateStorageId: merge.duplicateStorageId,
    duplicateThumbnailStorageId: merge.duplicateThumbnailStorageId,
  });
  merged += 1;
  console.log(`MERGED ${merge.slug}`);
}

const after = await client.query(api.replications.getAll, {});
const remaining = planHighConfidenceDuplicateMerges(after);
console.log(`Merged: ${merged}`);
console.log(`Remaining high-confidence merges: ${remaining.merges.length}`);
if (remaining.merges.length !== 0) throw new Error("Post-write duplicate verification failed.");
