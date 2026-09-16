import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  createUploadLedger,
  markBatchVerified,
  rcloneCommands,
  validateBatchSources,
  validateExistingResults,
  validatePublicCanaryReceipt,
} from "./run-local-r2-upload-batches.mjs";

const PLAN_SHA = "ab".repeat(32);

const plan = {
  readyToUpload: true,
  outputRoot: "/Volumes/Media/derivatives",
  uploadRoot: "/tmp/upload-staging",
  remoteRoot: "replications-r2:replications",
  summary: { uniqueObjects: 2, byteSize: 30 },
  objects: [
    { key: "media/sha256/aa/aa.webp", sha256: "aa", byteSize: 10, contentType: "image/webp" },
    { key: "media/sha256/bb/bb.mp4", sha256: "bb", byteSize: 20, contentType: "video/mp4" },
  ],
  batches: [
    { id: "batch-0001", objectCount: 2, byteSize: 30, keys: ["media/sha256/aa/aa.webp", "media/sha256/bb/bb.mp4"], filesFromPath: "/tmp/batch.txt" },
  ],
};

describe("rcloneCommands", () => {
  it("uses copy plus full-download check without sync or delete flags", () => {
    const commands = rcloneCommands(plan, plan.batches[0], { logPath: "/tmp/rclone.log" });
    expect(commands.copy[0]).toBe("copy");
    expect(commands.copy).toContain("--immutable");
    expect(commands.copy).toContain("--copy-links");
    expect(commands.check).toContain("--download");
    expect(commands.check).toContain("--one-way");
    expect(commands.copy.join(" ")).not.toMatch(/sync|delete/);
    expect(commands.check.join(" ")).not.toMatch(/sync|delete/);
  });
});

describe("upload ledger", () => {
  it("starts every batch pending and records verified object results once", () => {
    const ledger = createUploadLedger(plan, { planPath: "/tmp/plan.json", planSha256: PLAN_SHA });
    expect(ledger.batches["batch-0001"].status).toBe("pending");

    const first = markBatchVerified(ledger, plan, "batch-0001", PLAN_SHA, "2026-08-31T00:00:00.000Z");
    expect(first).toHaveLength(2);
    expect(first[0].plan_sha256).toBe(PLAN_SHA);
    expect(ledger.summary).toMatchObject({ verifiedBatches: 1, verifiedObjects: 2, verifiedBytes: 30 });
    expect(markBatchVerified(ledger, plan, "batch-0001", PLAN_SHA, "2026-08-31T00:01:00.000Z")).toEqual([]);
  });

  it("rejects a plan that is incomplete or points anywhere except the fixed R2 remote", () => {
    expect(() => createUploadLedger({ ...plan, readyToUpload: false }, { planPath: "/tmp/p", planSha256: PLAN_SHA })).toThrow(/not ready/);
    expect(() => createUploadLedger({ ...plan, remoteRoot: "other:" }, { planPath: "/tmp/p", planSha256: PLAN_SHA })).toThrow(/remote root/);
  });

  it("rejects stale results and a verified batch without complete plan-bound records", () => {
    const ledger = createUploadLedger(plan, { planPath: "/tmp/plan.json", planSha256: PLAN_SHA });
    expect(() => validateExistingResults(plan, ledger, [{ key: plan.objects[0].key, plan_sha256: "cd".repeat(32) }], PLAN_SHA)).toThrow(/different plan/);
    ledger.batches["batch-0001"].status = "verified";
    expect(() => validateExistingResults(plan, ledger, [], PLAN_SHA)).toThrow(/missing result/);
  });

  it("requires a complete public-delivery receipt for the canary keys", () => {
    const canaryPlan = { ...plan, uploadCanary: { keys: [plan.objects[0].key] } };
    const valid = [{
      ...plan.objects[0],
      size: plan.objects[0].byteSize,
      plan_sha256: PLAN_SHA,
      delivery_headers: { content_type: plan.objects[0].contentType, cache_control: "no-store", content_disposition: "inline", accept_ranges: "bytes" },
    }];
    expect(validatePublicCanaryReceipt(canaryPlan, valid, PLAN_SHA)).toMatchObject({ verifiedCanaryObjects: 1 });
    expect(() => validatePublicCanaryReceipt(canaryPlan, [], PLAN_SHA)).toThrow(/missing public verification/);
    const reusable = [{ ...valid[0], delivery_headers: { ...valid[0].delivery_headers, cache_control: "public, max-age=31536000, immutable" } }];
    expect(() => validatePublicCanaryReceipt(canaryPlan, reusable, PLAN_SHA)).toThrow(/delivery contract failed/);
  });

  it("revalidates staged symlink targets, sizes, and SHA-256 immediately before copy", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "r2-runner-source-"));
    const source = path.join(root, "source.webp");
    const uploadRoot = path.join(root, "staging");
    const staged = path.join(uploadRoot, plan.batches[0].keys[0]);
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    fs.writeFileSync(source, "source-bytes");
    fs.symlinkSync(source, staged);
    const sha256 = createHash("sha256").update("source-bytes").digest("hex");
    const localPlan = {
      ...plan,
      uploadRoot,
      objects: [{ key: plan.batches[0].keys[0], localPath: source, stagedPath: staged, sha256, byteSize: 12 }],
      batches: [{ ...plan.batches[0], keys: [plan.batches[0].keys[0]], objectCount: 1, byteSize: 12 }],
    };
    fs.writeFileSync(localPlan.batches[0].filesFromPath, `${localPlan.batches[0].keys[0]}\n`);
    await expect(validateBatchSources(localPlan, localPlan.batches[0])).resolves.toMatchObject({ verifiedObjects: 1 });
    fs.appendFileSync(source, "drift");
    await expect(validateBatchSources(localPlan, localPlan.batches[0])).rejects.toThrow(/size mismatch|SHA-256 mismatch/);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
