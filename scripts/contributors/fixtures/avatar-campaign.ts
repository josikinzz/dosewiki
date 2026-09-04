/**
 * Committed campaign shape for the avatar uploader tests: the real (tracked)
 * eight-create, four-existing projection plus a synthetic upload plan,
 * deployment receipt, and four tiny digest-named avatar assets laid out
 * beneath a `Data/` directory exactly as the campaign evidence library is.
 * Pins are literal so any fixture edit fails the suite the way a drifted
 * campaign artifact would.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { DEFAULT_PROJECTION_PATH, validateInputs } from "../upload-replication-index-profile-avatars";

export const FIXTURE_ROOT = path.join(import.meta.dirname, "avatar-campaign");
export const FIXTURE_PLAN_PATH = path.join(FIXTURE_ROOT, "Data/replication-index/convex-storage-upload-plan.json");
export const FIXTURE_RECEIPT_PATH = path.join(FIXTURE_ROOT, "Data/replication-index/convex-backend-deployment.json");
export const FIXTURE_PLAN_PAYLOAD_SHA256 = "bc534643f4c32198da2b64e00fb96ee9fca065a6f83601ea1e47a3eead690a61";
export const FIXTURE_RECEIPT_SHA256 = "037240dd9fd4cd674af75d1f7b670bc0c189b0c4086cf998e1142c9feca02041";

type UploadPlanFixture = {
  payloadSha256: string;
  sources: { contributorProfileImportProjection: { sha256: string } };
  records: Array<{ key: string; displayName: string; localAsset: null | { path: string } }>;
};

export function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function fixtureInputs(overrides: Partial<Parameters<typeof validateInputs>[0]> = {}) {
  return validateInputs({
    planPath: FIXTURE_PLAN_PATH,
    projectionPath: DEFAULT_PROJECTION_PATH,
    deploymentReceiptPath: FIXTURE_RECEIPT_PATH,
    expectedPlanPayloadSha256: FIXTURE_PLAN_PAYLOAD_SHA256,
    expectedDeploymentReceiptSha256: FIXTURE_RECEIPT_SHA256,
    ...overrides,
  });
}

/** Copies the fixture campaign into a temporary media root so a test can mutate one artifact. */
export function temporaryCampaign() {
  const root = mkdtempSync(path.join(tmpdir(), "dosewiki-avatar-campaign-"));
  mkdirSync(path.join(root, "Data/replication-index"), { recursive: true });
  mkdirSync(path.join(root, "staging"), { recursive: true });
  const plan = JSON.parse(readFileSync(FIXTURE_PLAN_PATH, "utf8")) as UploadPlanFixture;
  for (const record of plan.records) {
    if (!record.localAsset) continue;
    writeFileSync(path.join(root, record.localAsset.path), readFileSync(path.join(FIXTURE_ROOT, record.localAsset.path)));
  }
  const planPath = path.join(root, "Data/replication-index/convex-storage-upload-plan.json");
  const receiptPath = path.join(root, "Data/replication-index/convex-backend-deployment.json");
  writeFileSync(planPath, readFileSync(FIXTURE_PLAN_PATH));
  writeFileSync(receiptPath, readFileSync(FIXTURE_RECEIPT_PATH));
  return { root, plan, planPath, receiptPath };
}
