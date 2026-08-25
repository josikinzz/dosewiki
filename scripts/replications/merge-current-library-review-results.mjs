#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const BASE_MANIFEST_PATH =
  "/Users/josie/Documents/Dose Wiki Media Review/Data/current-library-taxonomy.json";
export const ASSIGNMENT_INDEX_PATH =
  "/Users/josie/Documents/Dose Wiki Media Review/work/current-library-taxonomy-review-2026-08-25/assignment-index.json";
export const OUTPUT_PATH =
  "/Users/josie/Documents/Dose Wiki Media Review/Data/current-library-taxonomy-reviewed.json";

const STATUSES = new Set(["replication", "not-replication", "unclear"]);
const CONFIDENCES = new Set(["high", "medium", "low"]);
const MODES = new Set(["open-eye", "closed-eye", "mixed", "uncertain"]);
const FAMILIES = new Set([
  "experiential-replication",
  "visionary-psychedelic-art",
  "traditional-cultural-art",
  "dark-surrealism",
  "optical-perceptual-art",
  "generative-abstract-art",
  "effect-illustration",
  "explanatory-figure",
  "uncertain",
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function countsBy(rows, key) {
  return Object.fromEntries(
    [...new Set(rows.map((row) => row[key]))]
      .sort()
      .map((value) => [value, rows.filter((row) => row[key] === value).length]),
  );
}

export function validateReview(review, assignedId, assignmentId) {
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    throw new Error(`${assignmentId}/${assignedId}: review must be an object.`);
  }
  if (review.productionId !== assignedId) {
    throw new Error(`${assignmentId}: expected ${assignedId}, received ${review.productionId}.`);
  }
  if (!STATUSES.has(review.replicationStatus)) {
    throw new Error(`${assignmentId}/${assignedId}: invalid replicationStatus.`);
  }
  if (!CONFIDENCES.has(review.replicationStatusConfidence)) {
    throw new Error(`${assignmentId}/${assignedId}: invalid replicationStatusConfidence.`);
  }
  requireString(review.replicationStatusRationale, `${assignmentId}/${assignedId} status rationale`);
  if (!FAMILIES.has(review.contentFamily)) {
    throw new Error(`${assignmentId}/${assignedId}: invalid contentFamily.`);
  }
  if (!Array.isArray(review.contentTags) || review.contentTags.some((tag) => typeof tag !== "string" || !tag.trim())) {
    throw new Error(`${assignmentId}/${assignedId}: contentTags must be non-empty strings.`);
  }
  if (!CONFIDENCES.has(review.contentFamilyConfidence)) {
    throw new Error(`${assignmentId}/${assignedId}: invalid contentFamilyConfidence.`);
  }
  requireString(review.contentFamilyRationale, `${assignmentId}/${assignedId} family rationale`);
  if (typeof review.reviewRequired !== "boolean") {
    throw new Error(`${assignmentId}/${assignedId}: reviewRequired must be boolean.`);
  }
  if (!Array.isArray(review.evidenceInspected) || review.evidenceInspected.length === 0) {
    throw new Error(`${assignmentId}/${assignedId}: evidenceInspected must be non-empty.`);
  }

  if (review.replicationStatus === "replication") {
    if (!MODES.has(review.viewingMode)) {
      throw new Error(`${assignmentId}/${assignedId}: every replication needs a valid viewingMode.`);
    }
    if (!CONFIDENCES.has(review.viewingModeConfidence)) {
      throw new Error(`${assignmentId}/${assignedId}: every replication needs viewingModeConfidence.`);
    }
    requireString(review.viewingModeRationale, `${assignmentId}/${assignedId} viewing-mode rationale`);
  } else if (
    review.viewingMode !== undefined ||
    review.viewingModeConfidence !== undefined ||
    review.viewingModeRationale !== undefined
  ) {
    throw new Error(`${assignmentId}/${assignedId}: non-replications and unclear rows must omit viewing-mode fields.`);
  }
}

export function mergeReviewResults({
  baseManifestPath = BASE_MANIFEST_PATH,
  assignmentIndexPath = ASSIGNMENT_INDEX_PATH,
} = {}) {
  const base = readJson(baseManifestPath);
  const index = readJson(assignmentIndexPath);
  if (index.snapshotDigest !== base.snapshotDigest) {
    throw new Error("Assignment snapshot digest does not match the base manifest.");
  }

  const assignmentRoot = dirname(assignmentIndexPath);
  const expectedRows = base.rows.filter((row) => row.replicationStatus === "unreviewed");
  const expectedIds = new Set(expectedRows.map((row) => row.productionId));
  if (expectedIds.size !== expectedRows.length || expectedRows.length !== index.scope.unreviewedRows) {
    throw new Error("Base unreviewed rows are not unique or do not match the assignment scope.");
  }

  const reviewById = new Map();
  const completedSources = [];
  for (const relativeAssignmentPath of index.assignments) {
    const assignmentPath = resolve(assignmentRoot, relativeAssignmentPath);
    const assignment = readJson(assignmentPath);
    const outputPath = assignment.outputPath;
    if (!existsSync(outputPath)) {
      throw new Error(`Missing completed review: ${outputPath}`);
    }
    const completed = readJson(outputPath);
    if (completed.schemaVersion !== 1 || completed.assignmentId !== assignment.assignmentId) {
      throw new Error(`${assignment.assignmentId}: completed file identity does not match assignment.`);
    }
    if (!Array.isArray(completed.items) || completed.items.length !== assignment.items.length) {
      throw new Error(`${assignment.assignmentId}: completed item count does not match assignment.`);
    }
    const assignedIds = assignment.items.map((item) => item.productionId);
    const completedById = new Map(completed.items.map((item) => [item.productionId, item]));
    if (completedById.size !== completed.items.length) {
      throw new Error(`${assignment.assignmentId}: duplicate completed production IDs.`);
    }
    for (const assignedId of assignedIds) {
      if (!expectedIds.has(assignedId) || reviewById.has(assignedId)) {
        throw new Error(`${assignment.assignmentId}: unexpected or duplicate assigned ID ${assignedId}.`);
      }
      const review = completedById.get(assignedId);
      validateReview(review, assignedId, assignment.assignmentId);
      reviewById.set(assignedId, review);
    }
    if (completedById.size !== assignedIds.length) {
      throw new Error(`${assignment.assignmentId}: completed file contains extra IDs.`);
    }
    completedSources.push({
      assignmentId: assignment.assignmentId,
      assignmentPath,
      assignmentSha256: sha256File(assignmentPath),
      completedPath: outputPath,
      completedSha256: sha256File(outputPath),
    });
  }

  if (reviewById.size !== expectedIds.size) {
    const missing = [...expectedIds].filter((id) => !reviewById.has(id));
    throw new Error(`Review campaign is incomplete; missing ${missing.length} IDs.`);
  }

  const rows = base.rows.map((row) => {
    const review = reviewById.get(row.productionId);
    if (!review) return row;
    const {
      viewingMode: _viewingMode,
      viewingModeTags: _viewingModeTags,
      viewingModeConfidence: _viewingModeConfidence,
      viewingModeReviewRequired: _viewingModeReviewRequired,
      viewingModeRationale: _viewingModeRationale,
      ...rowWithoutViewingMode
    } = row;
    const replication = review.replicationStatus === "replication";
    const uncertainMode = replication && review.viewingMode === "uncertain";
    const reviewRequired =
      review.reviewRequired ||
      review.replicationStatus === "unclear" ||
      review.replicationStatusConfidence === "low" ||
      review.contentFamilyConfidence === "low" ||
      review.viewingModeConfidence === "low" ||
      uncertainMode;
    return {
      ...rowWithoutViewingMode,
      replicationStatus: review.replicationStatus,
      replicationStatusConfidence: review.replicationStatusConfidence,
      replicationStatusReviewRequired: reviewRequired,
      replicationStatusRationale: review.replicationStatusRationale.trim(),
      ...(replication
        ? {
            viewingMode: review.viewingMode,
            viewingModeTags:
              review.viewingMode === "mixed"
                ? ["open-eye", "closed-eye"]
                : review.viewingMode === "uncertain"
                  ? []
                  : [review.viewingMode],
            viewingModeConfidence: review.viewingModeConfidence,
            viewingModeReviewRequired: reviewRequired,
            viewingModeRationale: review.viewingModeRationale.trim(),
          }
        : {}),
      contentFamily: review.contentFamily,
      contentTags: [...new Set(review.contentTags.map((tag) => tag.trim()))],
      contentFamilyConfidence: review.contentFamilyConfidence,
      contentFamilyReviewRequired: reviewRequired,
      contentFamilyRationale: review.contentFamilyRationale.trim(),
      taxonomyReviewRequired: reviewRequired,
      decisionBasis: "current-item-visual-review",
      reviewEvidenceInspected: review.evidenceInspected,
    };
  });

  const confirmed = rows.filter((row) => row.replicationStatus === "replication");
  if (confirmed.some((row) => !MODES.has(row.viewingMode))) {
    throw new Error("Every confirmed replication must have a controlled viewing mode.");
  }
  if (rows.some((row) => row.replicationStatus === "unreviewed")) {
    throw new Error("Reviewed manifest still contains explicitly unreviewed rows.");
  }

  return {
    ...base,
    generatedAt: new Date().toISOString(),
    sources: {
      ...base.sources,
      currentItemReviewCampaign: {
        assignmentIndexPath,
        assignmentIndexSha256: sha256File(assignmentIndexPath),
        completed: completedSources,
      },
    },
    policy: {
      ...base.policy,
      precedence: ["current-item-visual-review", ...base.policy.precedence],
    },
    summary: {
      rows: rows.length,
      artists: base.artists.length,
      replicationStatus: countsBy(rows, "replicationStatus"),
      viewingMode: countsBy(confirmed, "viewingMode"),
      contentFamily: countsBy(rows, "contentFamily"),
      taxonomyReviewRequired: rows.filter((row) => row.taxonomyReviewRequired).length,
      titleDrugTagged: rows.filter((row) => row.titleDrugs.length > 0).length,
      drugClassCounts: Object.fromEntries(
        ["psychedelics", "dissociatives", "deliriants", "other"].map((drugClass) => [
          drugClass,
          rows.filter((row) => row.drugClasses.includes(drugClass)).length,
        ]),
      ),
      artistPrimaryType: countsBy(base.artists, "primaryType"),
    },
    rows,
  };
}

function main() {
  const merged = mergeReviewResults();
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(JSON.stringify({ output: OUTPUT_PATH, summary: merged.summary }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
