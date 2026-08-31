import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  buildEightProfilePayload,
  acquireLedgerLock,
  createLedger,
  DEFAULT_DEPLOYMENT_RECEIPT_PATH,
  DEFAULT_PLAN_PATH,
  DEFAULT_PROJECTION_PATH,
  runUploadPhase,
  validateInputs,
  validateLedger,
  type AvatarUploadLedger,
} from "./upload-replication-index-profile-avatars";

function realInputs() {
  return validateInputs({
    planPath: DEFAULT_PLAN_PATH,
    projectionPath: DEFAULT_PROJECTION_PATH,
    deploymentReceiptPath: DEFAULT_DEPLOYMENT_RECEIPT_PATH,
  });
}

describe("Replication Index profile avatar uploader", () => {
  it("validates the exact four digest-bound uploads and eight-profile projection", () => {
    const inputs = realInputs();
    expect(inputs.uploads).toHaveLength(4);
    expect(inputs.projection.createProfiles).toHaveLength(8);
    for (const upload of inputs.uploads) {
      expect(path.basename(upload.assetPath)).toMatch(new RegExp(`^${upload.sha256}\\.`));
      expect(readFileSync(upload.assetPath)).toHaveLength(upload.byteSize);
    }
  });

  it("builds exactly eight reviewed-new profiles with explicit initials fallback", () => {
    const inputs = realInputs();
    const payload = buildEightProfilePayload(inputs);
    expect(payload.dryRun).toBe(true);
    expect(payload.entries).toHaveLength(8);
    expect(payload.entries.every((entry) => entry.outcome === "reviewed-new")).toBe(true);
    expect(payload.entries.every((entry) =>
      entry.outcome === "reviewed-new"
      && entry.profile.avatarStorageId === null
      && entry.profile.avatarR2Key === null
      && entry.profile.avatarUrl === null)).toBe(true);
  });

  it("binds only exact reviewed upload keys to returned Storage IDs", () => {
    const inputs = realInputs();
    const payload = buildEightProfilePayload(inputs, new Map([["BRYANITCH", "storage-canary"]]));
    const bryan = payload.entries.find(
      (entry) => entry.outcome === "reviewed-new" && entry.profile.key === "BRYANITCH",
    );
    expect(bryan).toMatchObject({ profile: { avatarStorageId: "storage-canary" } });
    expect(() => buildEightProfilePayload(inputs, new Map([["TYPO", "storage"]])))
      .toThrow(/Unexpected or empty avatar Storage binding/);
  });

  it("uploads only the canary, persists no URL, and records an eight-profile dry run", async () => {
    const inputs = realInputs();
    const ledger = createLedger(inputs, "2026-08-31T08:00:00.000Z");
    const snapshots: string[] = [];
    const upload = vi.fn(async () => ({ storageId: "storage-canary" }));
    const dryRunProfiles = vi.fn(async () => ({
      created: 8,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      blocked: 0,
    }));

    const result = await runUploadPhase("canary", inputs, ledger, {
      generateUploadUrl: async () => "https://glad-minnow-656.convex.cloud/one-time-secret",
      upload,
      dryRunProfiles,
      persist: (value) => snapshots.push(JSON.stringify(value)),
      now: () => "2026-08-31T08:01:00.000Z",
    });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(dryRunProfiles).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
    expect(result.ledger.uploads.filter((row) => row.status === "uploaded")).toHaveLength(1);
    expect(result.ledger.profileDryRuns).toMatchObject([{ phase: "canary", avatarStorageBindings: 1 }]);
    expect(snapshots.join("\n")).not.toContain("one-time-secret");
    expect(snapshots.join("\n")).not.toContain("apiKey");
  });

  it("refuses remaining uploads until the canary and its profile dry run pass", async () => {
    const inputs = realInputs();
    const ledger = createLedger(inputs);
    await expect(runUploadPhase("remaining", inputs, ledger, {
      generateUploadUrl: vi.fn(),
      upload: vi.fn(),
      dryRunProfiles: vi.fn(),
      persist: vi.fn(),
    })).rejects.toThrow(/Canary upload has not completed/);
  });

  it("uploads the other three only after canary verification and dry-runs all four bindings", async () => {
    const inputs = realInputs();
    const ledger = createLedger(inputs);
    let nextStorage = 0;
    const dependencies = {
      generateUploadUrl: async () => "https://glad-minnow-656.convex.cloud/opaque",
      upload: async () => ({ storageId: `storage-${++nextStorage}` }),
      dryRunProfiles: vi.fn(async () => ({
        created: 8,
        updated: 0,
        unchanged: 0,
        skipped: 0,
        blocked: 0,
      })),
      persist: vi.fn(),
    };
    await runUploadPhase("canary", inputs, ledger, dependencies);
    const result = await runUploadPhase("remaining", inputs, ledger, dependencies);
    expect(result.ledger.uploads.every((row) => row.status === "uploaded")).toBe(true);
    expect(result.ledger.profileDryRuns).toMatchObject([
      { phase: "canary", avatarStorageBindings: 1 },
      { phase: "remaining", avatarStorageBindings: 4 },
    ]);
    expect(result.payload.entries.filter((entry) =>
      entry.outcome === "reviewed-new" && entry.profile.avatarStorageId !== null)).toHaveLength(4);
  });

  it("marks an indeterminate upload uncertain and never auto-retries it", async () => {
    const inputs = realInputs();
    const ledger = createLedger(inputs);
    const persist = vi.fn();
    await expect(runUploadPhase("canary", inputs, ledger, {
      generateUploadUrl: async () => "https://glad-minnow-656.convex.cloud/opaque",
      upload: async () => { throw new Error("connection lost"); },
      dryRunProfiles: vi.fn(),
      persist,
    })).rejects.toThrow(/outcome is uncertain/);
    expect(ledger.uploads.find((row) => row.key === "BRYANITCH")).toMatchObject({
      status: "uncertain",
      storageId: null,
      errorCode: "upload-outcome-uncertain",
    });
    await expect(runUploadPhase("canary", inputs, ledger, {
      generateUploadUrl: vi.fn(),
      upload: vi.fn(),
      dryRunProfiles: vi.fn(),
      persist,
    })).rejects.toThrow(/manual reconciliation/);
  });

  it("holds an exclusive per-ledger lock across the production phase", () => {
    const temporary = mkdtempSync(path.join(tmpdir(), "dosewiki-avatar-lock-"));
    const ledgerPath = path.join(temporary, "ledger.json");
    const first = acquireLedgerLock(ledgerPath, "2026-08-31T08:00:00.000Z");
    expect(existsSync(first.lockPath)).toBe(true);
    expect(() => acquireLedgerLock(ledgerPath)).toThrow(/ledger is locked/);
    first.release();
    expect(existsSync(first.lockPath)).toBe(false);
    const second = acquireLedgerLock(ledgerPath);
    second.release();
  });

  it("rejects a stale ledger and changed avatar bytes before any network call", async () => {
    const inputs = realInputs();
    const stale = createLedger(inputs) as AvatarUploadLedger;
    stale.planPayloadSha256 = "0".repeat(64);
    expect(() => validateLedger(stale, inputs)).toThrow(/stale or targets the wrong/);

    const temporary = mkdtempSync(path.join(tmpdir(), "dosewiki-avatar-upload-"));
    const sourceCanary = inputs.uploads.find((row) => row.key === "BRYANITCH")!;
    const copiedAsset = path.join(temporary, path.basename(sourceCanary.assetPath));
    writeFileSync(copiedAsset, readFileSync(sourceCanary.assetPath));
    const changedInputs = {
      ...inputs,
      uploads: inputs.uploads.map((row) =>
        row.key === "BRYANITCH" ? { ...row, assetPath: copiedAsset } : row),
    };
    const ledger = createLedger(changedInputs);
    writeFileSync(copiedAsset, Buffer.from("changed"));
    const generateUploadUrl = vi.fn();
    await expect(runUploadPhase("canary", changedInputs, ledger, {
      generateUploadUrl,
      upload: vi.fn(),
      dryRunProfiles: vi.fn(),
      persist: vi.fn(),
    })).rejects.toThrow(/Avatar bytes drifted before upload/);
    expect(generateUploadUrl).not.toHaveBeenCalled();
  });
});
