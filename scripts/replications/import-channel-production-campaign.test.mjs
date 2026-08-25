import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vitest";
import { digestValue, EXPECTED_TARGET, loadLedger, validateCampaignPlan } from "./import-channel-production-campaign.mjs";

function fixture(title = "Forest Trip") {
  const root = path.join(tmpdir(), `channel-import-${process.pid}-${Math.random()}`); mkdirSync(root); for (const name of ["main.mp4", "poster.webp", "preview.mp4"]) writeFileSync(path.join(root, name), name);
  const entry = { id: "abc", title, slug: "forest-trip", action: "create", sourceUrl: "https://www.youtube.com/watch?v=abc", review: { verdict: "replication" }, proposedRow: { slug: "forest-trip", title, artist: "Loka", role: "replication", type: "video", effect_slug: "drifting", effect_tags: [], duration: 30, format: "mp4", file_size: 8, rights_status: "unknown" }, upload: { mainPath: path.join(root, "main.mp4"), posterPath: path.join(root, "poster.webp"), previewPath: path.join(root, "preview.mp4") } };
  const plan = { schemaVersion: 1, operation: "channel-replications-production-preparation", target: EXPECTED_TARGET, writeAuthorized: false, sourceFilesPreserved: true, durationLimitSeconds: 600, liveSnapshot: {}, buckets: { create: [entry], exclude: [], existing: [], replacement: [] }, counts: { create: 1, replacement: 0 } };
  plan.planDigest = digestValue({ schemaVersion: plan.schemaVersion, operation: plan.operation, target: plan.target, writeAuthorized: plan.writeAuthorized, sourceFilesPreserved: plan.sourceFilesPreserved, durationLimitSeconds: plan.durationLimitSeconds, liveSnapshot: plan.liveSnapshot, buckets: plan.buckets });
  return { root, plan, entry };
}

test("accepts a digest-valid create with all three delivery assets", () => { const f = fixture(); assert.equal(validateCampaignPlan(f.plan, path.join(f.root, "plan.json")).length, 1); });
test("rejects plan digest drift", () => { const f = fixture(); f.entry.title = "changed"; assert.throws(() => validateCampaignPlan(f.plan, path.join(f.root, "plan.json")), /digest mismatch/); });
test("hard rejects 360, 180, and VR media", () => { for (const title of ["Forest 360 degree", "180° vision", "Forest VR"]) { const f = fixture(title); f.plan.planDigest = digestValue({ schemaVersion: f.plan.schemaVersion, operation: f.plan.operation, target: f.plan.target, writeAuthorized: f.plan.writeAuthorized, sourceFilesPreserved: f.plan.sourceFilesPreserved, durationLimitSeconds: f.plan.durationLimitSeconds, liveSnapshot: f.plan.liveSnapshot, buckets: f.plan.buckets }); assert.throws(() => validateCampaignPlan(f.plan, path.join(f.root, "plan.json")), /forbidden/); } });
test("hard rejects duration above 600", () => { const f = fixture(); f.entry.proposedRow.duration = 601; f.plan.planDigest = digestValue({ schemaVersion: f.plan.schemaVersion, operation: f.plan.operation, target: f.plan.target, writeAuthorized: f.plan.writeAuthorized, sourceFilesPreserved: f.plan.sourceFilesPreserved, durationLimitSeconds: f.plan.durationLimitSeconds, liveSnapshot: f.plan.liveSnapshot, buckets: f.plan.buckets }); assert.throws(() => validateCampaignPlan(f.plan, path.join(f.root, "plan.json")), /duration/); });
test("ledger must match exact plan digest", () => { const f = fixture(); const ledgerPath = path.join(f.root, "ledger.json"); writeFileSync(ledgerPath, JSON.stringify({ target: EXPECTED_TARGET, planPath: "/plan", planDigest: "old" })); assert.throws(() => loadLedger(ledgerPath, "/plan", f.plan.planDigest), /not bound/); });
test("supplemental manifest accepts only 4yl4COV5FOw", () => { const f = fixture(); const bad = { items: [{ youtubeId: "other" }] }; assert.throws(() => validateCampaignPlan(f.plan, path.join(f.root, "plan.json"), bad), /4yl4COV5FOw/); });
