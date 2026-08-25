#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const CAMPAIGN_ROOT =
  "/Users/josie/Documents/Dose Wiki Media Review/work/current-library-taxonomy-review-2026-08-25";
const PRIMARY_INDEX_PATH = resolve(CAMPAIGN_ROOT, "assignment-index.json");
const SECONDARY_INDEX_PATH = resolve(CAMPAIGN_ROOT, "second-review/assignment-index.json");
const OUTPUT_ROOT = resolve(CAMPAIGN_ROOT, "third-review");
const TARGET_ASSIGNMENT_SIZE = 10;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function loadCampaign(indexPath) {
  const index = readJson(indexPath);
  const root = dirname(indexPath);
  const items = new Map();
  const reviews = new Map();
  const sources = [];
  for (const relativePath of index.assignments) {
    const assignmentPath = resolve(root, relativePath);
    const assignment = readJson(assignmentPath);
    const completed = readJson(assignment.outputPath);
    for (const item of assignment.items) items.set(item.productionId, item);
    for (const review of completed.items) reviews.set(review.productionId, review);
    sources.push({
      assignmentId: assignment.assignmentId,
      completedPath: assignment.outputPath,
      completedSha256: sha256File(assignment.outputPath),
    });
  }
  return { index, items, reviews, sources };
}

function decision(review) {
  return {
    replicationStatus: review.replicationStatus,
    viewingMode: review.replicationStatus === "replication" ? review.viewingMode : null,
    contentFamily: review.contentFamily,
  };
}

function main() {
  const primary = loadCampaign(PRIMARY_INDEX_PATH);
  const secondary = loadCampaign(SECONDARY_INDEX_PATH);
  const conflicts = [];
  for (const [productionId, secondaryReview] of secondary.reviews) {
    const primaryReview = primary.reviews.get(productionId);
    const item = primary.items.get(productionId);
    if (!primaryReview || !item) throw new Error(`Missing primary review data for ${productionId}.`);
    const primaryDecision = decision(primaryReview);
    const secondaryDecision = decision(secondaryReview);
    if (JSON.stringify(primaryDecision) !== JSON.stringify(secondaryDecision)) {
      conflicts.push({
        ...item,
        competingDecisions: {
          primary: primaryDecision,
          secondary: secondaryDecision,
        },
      });
    }
  }

  mkdirSync(resolve(OUTPUT_ROOT, "assignments"), { recursive: true });
  mkdirSync(resolve(OUTPUT_ROOT, "completed"), { recursive: true });
  const assignmentCount = conflicts.length === 0 ? 0 : Math.ceil(conflicts.length / TARGET_ASSIGNMENT_SIZE);
  const assignments = [];
  for (let index = 0; index < assignmentCount; index += 1) {
    const start = Math.floor((index * conflicts.length) / assignmentCount);
    const end = Math.floor(((index + 1) * conflicts.length) / assignmentCount);
    const assignmentId = `tertiary-review-${String(index + 1).padStart(2, "0")}`;
    const relativePath = `assignments/${assignmentId}.json`;
    const outputPath = resolve(OUTPUT_ROOT, "completed", `${assignmentId}.json`);
    const assignment = {
      schemaVersion: 1,
      campaignId: "current-library-taxonomy-tertiary-review-2026-08-25",
      assignmentId,
      generatedAt: new Date().toISOString(),
      instructions: {
        task: "Adjudicate every item where two independent visual reviews disagreed.",
        reviewOrder: "Inspect the actual media first and form your own decision. Then compare the two competing controlled decisions included with the item.",
        statusValues: ["replication", "not-replication", "unclear"],
        statusRule: "A replication directly depicts or simulates a named subjective perceptual experience. Psychedelic style, fantasy subject matter, effect-folder placement, or artist reputation alone is insufficient.",
        viewingModeValues: ["open-eye", "closed-eye", "mixed", "uncertain"],
        viewingModeRule: "Every replication must receive a viewing mode. Open-eye retains an identifiable external-world substrate with distortions; closed-eye is a self-contained geometric, visionary, hyperspace, entity, or imagined field; mixed contains material phases of both.",
        contentFamilyValues: ["experiential-replication", "visionary-psychedelic-art", "traditional-cultural-art", "dark-surrealism", "optical-perceptual-art", "generative-abstract-art", "effect-illustration", "explanatory-figure", "uncertain"],
        evidenceRule: "Inspect the actual image or distributed full-duration video frames. Use unclear if the evidence still cannot resolve replication status.",
        outputShape: {
          schemaVersion: 1,
          assignmentId,
          items: [{
            productionId: "exact assigned ID",
            replicationStatus: "replication | not-replication | unclear",
            replicationStatusConfidence: "high | medium | low",
            replicationStatusRationale: "concrete adjudication rationale",
            viewingMode: "required for replication; otherwise omit",
            viewingModeConfidence: "required for replication; otherwise omit",
            viewingModeRationale: "required for replication; otherwise omit",
            contentFamily: "one controlled family",
            contentTags: ["short controlled descriptive tags"],
            contentFamilyConfidence: "high | medium | low",
            contentFamilyRationale: "concrete theme rationale",
            reviewRequired: false,
            evidenceInspected: ["image | distributed-video-frames | preview | main-media"],
          }],
        },
      },
      outputPath,
      items: conflicts.slice(start, end),
    };
    writeFileSync(resolve(OUTPUT_ROOT, relativePath), `${JSON.stringify(assignment, null, 2)}\n`);
    assignments.push(relativePath);
  }

  const index = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    campaignId: "current-library-taxonomy-tertiary-review-2026-08-25",
    primaryIndexPath: PRIMARY_INDEX_PATH,
    secondaryIndexPath: SECONDARY_INDEX_PATH,
    primarySources: primary.sources,
    secondarySources: secondary.sources,
    scope: { disagreements: conflicts.length, assignments: assignmentCount },
    assignments,
  };
  writeFileSync(resolve(OUTPUT_ROOT, "assignment-index.json"), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`Prepared ${conflicts.length} tertiary adjudications across ${assignmentCount} assignments in ${OUTPUT_ROOT}.`);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
