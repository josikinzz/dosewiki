#!/usr/bin/env node
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createDataClient, resolvePostgresSource, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"

const target = "https://glad-minnow-656.convex.cloud";
const reviewRoot = "/Users/josie/Documents/Dose Wiki Media Review";
const preparationPath = path.join(reviewRoot, "Data", "Dillan Review", "dillan-convex-preparation.json");
const manifestPath = path.join(reviewRoot, "Data", "Dillan Review", "feetman-stas-renditions-manifest.json");
const planPath = path.join(reviewRoot, "Data", "Dillan Review", "feetman-stas-production-upload-plan.json");

const preparation = JSON.parse(readFileSync(preparationPath, "utf8"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.status !== "validated" || manifest.completed !== 73) throw new Error("Rendition manifest is not complete and validated.");
if (preparation.entries.length !== 73) throw new Error(`Expected 73 prepared entries, found ${preparation.entries.length}.`);
const renditionById = new Map(manifest.items.map((item) => [item.id, item]));

const client = createDataClient({ target: resolvePostgresSource().url }).client;
const [liveRows, effects] = await Promise.all([
  client.query(api.replications.getAll, {}),
  client.query(api.subjectiveEffects.getPublicPreviews, {}),
]);
const liveBySlug = new Map(liveRows.map((row) => [row.slug, row]));
const liveBySource = new Map(liveRows.filter((row) => row.source_url).map((row) => [row.source_url, row]));
const effectSlugs = new Set(effects.map((effect) => effect.slug));

const entries = preparation.entries.map((prepared) => {
  const rendition = renditionById.get(prepared.id);
  if (!rendition) throw new Error(`Missing rendition: ${prepared.id}`);
  const proposedRow = {
    ...prepared.proposedRow,
    width: rendition.main.width,
    height: rendition.main.height,
    duration: rendition.main.duration,
    format: "mp4",
    file_size: rendition.main.bytes,
  };
  if (!effectSlugs.has(proposedRow.effect_slug)) throw new Error(`Unknown live effect ${proposedRow.effect_slug}: ${prepared.id}`);
  for (const tag of proposedRow.effect_tags ?? []) {
    if (!effectSlugs.has(tag)) throw new Error(`Unknown live effect tag ${tag}: ${prepared.id}`);
  }
  if (proposedRow.duration > 600) throw new Error(`Over 10 minutes: ${prepared.id}`);
  const upload = {
    mainPath: rendition.main.path,
    thumbnailPath: rendition.thumbnail.path,
    previewPath: rendition.preview.path,
  };
  for (const file of Object.values(upload)) {
    if (!path.isAbsolute(file) || !statSync(file).isFile()) throw new Error(`Missing upload file: ${file}`);
  }
  const sourceMatch = liveBySource.get(proposedRow.source_url);
  const slugMatch = liveBySlug.get(prepared.slug);
  let action = "create";
  let reason = "reviewed-validated-new-source";
  let productionId = null;
  if (sourceMatch) {
    action = "existing";
    reason = "exact-source-url-already-live";
    productionId = sourceMatch._id;
  } else if (slugMatch) {
    action = "collision";
    reason = "foreign-live-slug-collision";
    productionId = slugMatch._id;
  }
  return {
    id: prepared.id, slug: prepared.slug, title: prepared.title, artist: prepared.artist,
    kind: "video", localSourcePath: prepared.localSourcePath,
    review: prepared.review, substances: prepared.substances, warnings: prepared.warnings,
    action, reason, productionId, proposedRow, upload,
    renditionHashes: { main: rendition.main.sha256, thumbnail: rendition.thumbnail.sha256, preview: rendition.preview.sha256 },
  };
});

const counts = Object.fromEntries(["create", "existing", "collision", "exclude"].map((action) => [action, entries.filter((entry) => entry.action === action).length]));
const creates = entries.filter((entry) => entry.action === "create");
const plan = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), target, // Historical campaign source pin.
  postgresTarget: postgresFingerprintFromUrl(resolvePostgresSource().url),
  sourcePreparation: preparationPath, sourceRenditionManifest: manifestPath,
  sourceFilesPreserved: true, dryRunOnlyUntilExplicitWriteFlags: true, counts,
  createMainBytes: creates.reduce((sum, entry) => sum + entry.proposedRow.file_size, 0),
  createTotalUploadBytes: creates.reduce((sum, entry) => sum + Object.values(entry.upload).reduce((subtotal, file) => subtotal + statSync(file).size, 0), 0),
  entries,
};
writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({ planPath, liveRows: liveRows.length, counts, createMainBytes: plan.createMainBytes, createTotalUploadBytes: plan.createTotalUploadBytes }, null, 2));
