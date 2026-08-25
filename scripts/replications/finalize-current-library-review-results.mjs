#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { validateReview } from "./merge-current-library-review-results.mjs";
import { reconcileSourceReplicationContext } from "./reconcile-current-library-context.mjs";

const MANIFEST_PATH =
  "/Users/josie/Documents/Dose Wiki Media Review/Data/current-library-taxonomy-reviewed.json";
const CAMPAIGN_ROOT =
  "/Users/josie/Documents/Dose Wiki Media Review/work/current-library-taxonomy-review-2026-08-25";
const PRIMARY_INDEX_PATH = resolve(CAMPAIGN_ROOT, "assignment-index.json");
const SECONDARY_INDEX_PATH = resolve(CAMPAIGN_ROOT, "second-review/assignment-index.json");
const TERTIARY_INDEX_PATH = resolve(CAMPAIGN_ROOT, "third-review/assignment-index.json");
const SOURCE_SNAPSHOT_PATH =
  "/Users/josie/Documents/Dose Wiki Media Review/Data/Channel Candidates 2026-08-23/live-production-snapshot.json";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function loadCampaign(indexPath) {
  const index = readJson(indexPath);
  const root = dirname(indexPath);
  const reviews = new Map();
  const sources = [];
  for (const relativePath of index.assignments) {
    const assignmentPath = resolve(root, relativePath);
    const assignment = readJson(assignmentPath);
    const completed = readJson(assignment.outputPath);
    if (completed.assignmentId !== assignment.assignmentId || completed.items.length !== assignment.items.length) {
      throw new Error(`${assignment.assignmentId}: completed review does not match assignment.`);
    }
    const completedById = new Map(completed.items.map((review) => [review.productionId, review]));
    if (completedById.size !== completed.items.length) {
      throw new Error(`${assignment.assignmentId}: duplicate completed production IDs.`);
    }
    for (const item of assignment.items) {
      const review = completedById.get(item.productionId);
      validateReview(review, item.productionId, assignment.assignmentId);
      if (reviews.has(item.productionId)) throw new Error(`Duplicate campaign review for ${item.productionId}.`);
      reviews.set(item.productionId, review);
    }
    sources.push({
      assignmentId: assignment.assignmentId,
      assignmentPath,
      assignmentSha256: sha256File(assignmentPath),
      completedPath: assignment.outputPath,
      completedSha256: sha256File(assignment.outputPath),
    });
  }
  return { index, reviews, sources };
}

function decision(review) {
  return {
    replicationStatus: review.replicationStatus,
    viewingMode: review.replicationStatus === "replication" ? review.viewingMode : null,
    contentFamily: review.contentFamily,
  };
}

function sameDecision(left, right) {
  return JSON.stringify(decision(left)) === JSON.stringify(decision(right));
}

function countsBy(rows, key) {
  return Object.fromEntries(
    [...new Set(rows.map((row) => row[key]))]
      .sort()
      .map((value) => [value, rows.filter((row) => row[key] === value).length]),
  );
}

function sourceDescriptor(indexPath, campaign) {
  return {
    assignmentIndexPath: indexPath,
    assignmentIndexSha256: sha256File(indexPath),
    completed: campaign.sources,
  };
}

function reviewRequiresFollowup(review) {
  return (
    review.reviewRequired ||
    review.replicationStatus === "unclear" ||
    review.replicationStatusConfidence === "low" ||
    review.contentFamilyConfidence === "low" ||
    review.viewingMode === "uncertain" ||
    review.viewingModeConfidence === "low"
  );
}

function projectHistory(label, review) {
  return {
    stage: label,
    decision: decision(review),
    replicationStatusConfidence: review.replicationStatusConfidence,
    contentFamilyConfidence: review.contentFamilyConfidence,
    ...(review.viewingModeConfidence
      ? { viewingModeConfidence: review.viewingModeConfidence }
      : {}),
    reviewRequired: review.reviewRequired,
    evidenceInspected: review.evidenceInspected,
  };
}

function applyReview(row, review, history, decisionBasis) {
  const {
    viewingMode: _viewingMode,
    viewingModeTags: _viewingModeTags,
    viewingModeConfidence: _viewingModeConfidence,
    viewingModeReviewRequired: _viewingModeReviewRequired,
    viewingModeRationale: _viewingModeRationale,
    ...rowWithoutViewingMode
  } = row;
  const replication = review.replicationStatus === "replication";
  const reviewRequired = reviewRequiresFollowup(review);
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
    decisionBasis,
    reviewEvidenceInspected: [...new Set(history.flatMap((entry) => entry.evidenceInspected))],
    reviewHistory: history,
    classificationReviewCount: history.length,
    classificationReviewAgreement: history.length === 2,
  };
}

function main() {
  const manifest = readJson(MANIFEST_PATH);
  const primary = loadCampaign(PRIMARY_INDEX_PATH);
  const secondary = loadCampaign(SECONDARY_INDEX_PATH);
  const tertiary = loadCampaign(TERTIARY_INDEX_PATH);
  if (secondary.reviews.size !== secondary.index.scope.flaggedItems) {
    throw new Error("Secondary campaign does not cover its exact flagged scope.");
  }
  if (tertiary.reviews.size !== tertiary.index.scope.disagreements) {
    throw new Error("Tertiary campaign does not cover its exact disagreement scope.");
  }

  const conflictIds = new Set();
  for (const [id, secondaryReview] of secondary.reviews) {
    const primaryReview = primary.reviews.get(id);
    if (!primaryReview) throw new Error(`Missing primary review for ${id}.`);
    if (!sameDecision(primaryReview, secondaryReview)) conflictIds.add(id);
  }
  if (conflictIds.size !== tertiary.index.scope.disagreements) {
    throw new Error("Tertiary disagreement scope drifted from the current review files.");
  }

  const reviewedRows = manifest.rows.map((row) => {
    const secondaryReview = secondary.reviews.get(row.productionId);
    if (!secondaryReview) return row;
    const primaryReview = primary.reviews.get(row.productionId);
    if (!primaryReview) throw new Error(`Missing primary review for ${row.productionId}.`);
    if (!conflictIds.has(row.productionId)) {
      return applyReview(
        row,
        secondaryReview,
        [projectHistory("primary", primaryReview), projectHistory("secondary", secondaryReview)],
        "current-item-independent-review",
      );
    }
    const tertiaryReview = tertiary.reviews.get(row.productionId);
    if (!tertiaryReview) throw new Error(`Missing tertiary adjudication for ${row.productionId}.`);
    return applyReview(
      row,
      tertiaryReview,
      [
        projectHistory("primary", primaryReview),
        projectHistory("secondary", secondaryReview),
        projectHistory("tertiary", tertiaryReview),
      ],
      "current-item-tertiary-adjudication",
    );
  });
  const sourceSnapshot = readJson(SOURCE_SNAPSHOT_PATH);
  const rows = reconcileSourceReplicationContext(reviewedRows, sourceSnapshot.replications);

  const confirmed = rows.filter((row) => row.replicationStatus === "replication");
  if (rows.some((row) => row.replicationStatus === "unreviewed")) {
    throw new Error("Final manifest still contains explicitly unreviewed rows.");
  }
  if (confirmed.some((row) => !row.viewingMode)) {
    throw new Error("Final manifest has a confirmed replication without a viewing mode.");
  }
  const finalized = {
    ...manifest,
    generatedAt: new Date().toISOString(),
    sources: {
      ...manifest.sources,
      currentItemSecondaryReviewCampaign: sourceDescriptor(SECONDARY_INDEX_PATH, secondary),
      currentItemTertiaryReviewCampaign: sourceDescriptor(TERTIARY_INDEX_PATH, tertiary),
      sourceReplicationContext: {
        path: SOURCE_SNAPSHOT_PATH,
        sha256: sha256File(SOURCE_SNAPSHOT_PATH),
      },
    },
    policy: {
      ...manifest.policy,
      precedence: [
        "source-replication-context",
        "current-item-tertiary-adjudication",
        "current-item-independent-review",
        ...manifest.policy.precedence.filter(
          (value) =>
            value !== "source-replication-context" &&
            value !== "current-item-tertiary-adjudication" &&
            value !== "current-item-independent-review",
        ),
      ],
      statusRule:
        "An explicit replication role or effect assignment is item-level replication context. Illustrative effect examples and traditional psychedelic artwork remain replications; only explicit figures or concrete item-specific exclusions are not-replications.",
    },
    summary: {
      rows: rows.length,
      artists: manifest.artists.length,
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
      artistPrimaryType: countsBy(manifest.artists, "primaryType"),
    },
    rows,
  };
  const temporaryPath = `${MANIFEST_PATH}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(finalized, null, 2)}\n`);
  renameSync(temporaryPath, MANIFEST_PATH);
  console.log(JSON.stringify({ output: MANIFEST_PATH, conflicts: conflictIds.size, summary: finalized.summary }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
