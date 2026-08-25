#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const PRIMARY_INDEX_PATH =
  "/Users/josie/Documents/Dose Wiki Media Review/work/current-library-taxonomy-review-2026-08-25/assignment-index.json";
const OUTPUT_ROOT =
  "/Users/josie/Documents/Dose Wiki Media Review/work/current-library-taxonomy-review-2026-08-25/second-review";
const TARGET_ASSIGNMENT_SIZE = 12;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function main() {
  const primaryIndex = readJson(PRIMARY_INDEX_PATH);
  const primaryRoot = dirname(PRIMARY_INDEX_PATH);
  const itemById = new Map();
  const flaggedIds = new Set();
  const primarySources = [];

  for (const relativePath of primaryIndex.assignments) {
    const assignmentPath = resolve(primaryRoot, relativePath);
    const assignment = readJson(assignmentPath);
    for (const item of assignment.items) itemById.set(item.productionId, item);
    const completedPath = assignment.outputPath;
    const completed = readJson(completedPath);
    for (const review of completed.items) {
      if (review.reviewRequired || review.replicationStatus === "unclear") {
        flaggedIds.add(review.productionId);
      }
    }
    primarySources.push({
      assignmentId: assignment.assignmentId,
      completedPath,
      completedSha256: sha256File(completedPath),
    });
  }

  const items = [...flaggedIds].map((id) => {
    const item = itemById.get(id);
    if (!item) throw new Error(`No assignment metadata found for ${id}.`);
    return item;
  });
  const assignmentCount = Math.max(1, Math.ceil(items.length / TARGET_ASSIGNMENT_SIZE));
  mkdirSync(resolve(OUTPUT_ROOT, "assignments"), { recursive: true });
  mkdirSync(resolve(OUTPUT_ROOT, "completed"), { recursive: true });
  const relativeAssignments = [];

  for (let index = 0; index < assignmentCount; index += 1) {
    const start = Math.floor((index * items.length) / assignmentCount);
    const end = Math.floor(((index + 1) * items.length) / assignmentCount);
    const assignmentId = `secondary-review-${String(index + 1).padStart(2, "0")}`;
    const relativePath = `assignments/${assignmentId}.json`;
    const outputPath = resolve(OUTPUT_ROOT, "completed", `${assignmentId}.json`);
    const assignment = {
      schemaVersion: 1,
      campaignId: "current-library-taxonomy-secondary-review-2026-08-25",
      assignmentId,
      generatedAt: new Date().toISOString(),
      instructions: {
        task: "Independently review every assigned boundary or unclear asset without reading the first review.",
        independenceRule: "Do not open any primary completed-review file. Decide from the actual media and assignment metadata only.",
        statusValues: ["replication", "not-replication", "unclear"],
        statusRule: "A replication directly depicts or simulates a named subjective perceptual experience. Psychedelic style, fantasy subject matter, effect-folder placement, or artist reputation alone is insufficient.",
        viewingModeValues: ["open-eye", "closed-eye", "mixed", "uncertain"],
        viewingModeRule: "Every replication must receive a viewing mode. Open-eye retains an identifiable external-world substrate with distortions; closed-eye is a self-contained geometric, visionary, hyperspace, entity, or imagined field; mixed contains material phases of both.",
        contentFamilyValues: ["experiential-replication", "visionary-psychedelic-art", "traditional-cultural-art", "dark-surrealism", "optical-perceptual-art", "generative-abstract-art", "effect-illustration", "explanatory-figure", "uncertain"],
        evidenceRule: "Inspect the actual image. For video, inspect distributed frames across the full duration. Do not decide from the thumbnail or title alone. Name the visible substrate or explain why none exists.",
        safety: "Read-only review. Do not mutate production, originals, catalog files, the source manifest, or primary-review files.",
        outputShape: {
          schemaVersion: 1,
          assignmentId,
          items: [{
            productionId: "exact assigned ID",
            replicationStatus: "replication | not-replication | unclear",
            replicationStatusConfidence: "high | medium | low",
            replicationStatusRationale: "concrete item-level visual rationale",
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
      items: items.slice(start, end),
    };
    writeFileSync(resolve(OUTPUT_ROOT, relativePath), `${JSON.stringify(assignment, null, 2)}\n`);
    relativeAssignments.push(relativePath);
  }

  const index = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    campaignId: "current-library-taxonomy-secondary-review-2026-08-25",
    primaryIndexPath: PRIMARY_INDEX_PATH,
    primaryIndexSha256: sha256File(PRIMARY_INDEX_PATH),
    primarySources,
    scope: {
      flaggedItems: items.length,
      assignments: assignmentCount,
      reason: "Primary review marked reviewRequired or returned unclear.",
    },
    assignments: relativeAssignments,
  };
  const indexPath = resolve(OUTPUT_ROOT, "assignment-index.json");
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`Prepared ${items.length} secondary reviews across ${assignmentCount} assignments in ${OUTPUT_ROOT}.`);
  console.log(`Index: ${basename(indexPath)}`);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
