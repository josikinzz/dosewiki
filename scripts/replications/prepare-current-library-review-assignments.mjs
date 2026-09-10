#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../convex/_generated/api.js";

const TARGET = "https://glad-minnow-656.convex.cloud";
const MANIFEST_PATH =
  "/Users/josie/Documents/Dose Wiki Media Review/Data/current-library-taxonomy.json";
const WORK_DIR =
  "/Users/josie/Documents/Dose Wiki Media Review/work/current-library-taxonomy-review-2026-08-25";
const ASSIGNMENT_COUNT = 18;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function compareRows(left, right) {
  return left.artist.localeCompare(right.artist) || left.title.localeCompare(right.title);
}

async function main() {
  const manifest = readJson(MANIFEST_PATH);
  const unreviewed = manifest.rows.filter(
    (row) => row.replicationStatus === "unreviewed",
  );
  if (unreviewed.length !== 357) {
    throw new Error(`Expected 357 unreviewed rows, found ${unreviewed.length}.`);
  }

  const liveRows = await createDataClient({ target: TARGET }).client.query(api.replications.getAll, {});
  const liveById = new Map(liveRows.map((row) => [row._id, row]));
  const items = unreviewed
    .map((taxonomy) => {
      const live = liveById.get(taxonomy.productionId);
      if (!live) throw new Error(`Missing live row ${taxonomy.productionId}.`);
      return {
        productionId: taxonomy.productionId,
        slug: live.slug,
        title: live.title,
        artist: live.artist,
        type: live.type,
        role: live.role ?? "replication",
        effectSlug: live.effect_slug ?? null,
        effectTags: live.effect_tags ?? [],
        url: live.url,
        thumbnailUrl: live.thumbnail_url ?? null,
        previewUrl: live.preview_url ?? null,
        duration: live.duration ?? null,
        currentContentFamily: taxonomy.contentFamily,
        currentContentTags: taxonomy.contentTags,
        currentFamilyRationale: taxonomy.contentFamilyRationale,
      };
    })
    .sort(compareRows);

  const assignments = Array.from({ length: ASSIGNMENT_COUNT }, () => []);
  items.forEach((item, index) => assignments[index % ASSIGNMENT_COUNT].push(item));
  const assignmentsDir = join(WORK_DIR, "assignments");
  const completedDir = join(WORK_DIR, "completed");
  mkdirSync(assignmentsDir, { recursive: true });
  mkdirSync(completedDir, { recursive: true });

  assignments.forEach((assignmentItems, index) => {
    const assignmentId = `current-review-${String(index + 1).padStart(2, "0")}`;
    writeJson(join(assignmentsDir, `${assignmentId}.json`), {
      schemaVersion: 1,
      assignmentId,
      outputPath: join(completedDir, `${assignmentId}.json`),
      instructions: {
        task: "Perform an item-level visual review of every assigned currently-unreviewed production asset.",
        statusValues: ["replication", "not-replication", "unclear"],
        statusRule:
          "A replication directly depicts or simulates a named subjective perceptual experience. Psychedelic style, fantasy subject matter, effect-folder placement, or artist reputation alone is insufficient.",
        viewingModeValues: ["open-eye", "closed-eye", "mixed", "uncertain"],
        viewingModeRule:
          "Every replication must receive a viewing mode. Open-eye retains an identifiable external-world substrate with distortions; closed-eye is a self-contained geometric, visionary, hyperspace, entity, or imagined field; mixed contains material phases of both.",
        contentFamilyValues: [
          "experiential-replication",
          "visionary-psychedelic-art",
          "traditional-cultural-art",
          "dark-surrealism",
          "optical-perceptual-art",
          "generative-abstract-art",
          "effect-illustration",
          "explanatory-figure",
          "uncertain",
        ],
        evidenceRule:
          "Inspect the actual image. For video, inspect distributed frames across the full duration and use the preview/main media as needed. Do not decide from the thumbnail or title alone. Name the visible substrate or explain why none exists.",
        safety:
          "Read-only review. Do not mutate production, originals, catalog files, or the source manifest. Temporary downloads are allowed and must not replace originals.",
        outputShape: {
          schemaVersion: 1,
          assignmentId,
          items: [
            {
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
            },
          ],
        },
      },
      items: assignmentItems,
    });
  });

  writeJson(join(WORK_DIR, "assignment-index.json"), {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: TARGET,
    manifestPath: MANIFEST_PATH,
    snapshotDigest: manifest.snapshotDigest,
    scope: {
      unreviewedRows: items.length,
      assignments: ASSIGNMENT_COUNT,
      minItemsPerAssignment: Math.min(...assignments.map((items) => items.length)),
      maxItemsPerAssignment: Math.max(...assignments.map((items) => items.length)),
    },
    assignments: assignments.map((_, index) =>
      `assignments/current-review-${String(index + 1).padStart(2, "0")}.json`,
    ),
  });
  console.log(`Prepared ${items.length} rows across ${ASSIGNMENT_COUNT} assignments in ${WORK_DIR}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
