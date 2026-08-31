import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  buildEightProfilePayload,
  buildContributorProfileSnapshot,
  buildExistingProfilePayload,
  acquireLedgerLock,
  createLedger,
  DEFAULT_DEPLOYMENT_RECEIPT_PATH,
  DEFAULT_PLAN_PATH,
  DEFAULT_PROJECTION_PATH,
  runExistingProfileDryRunPhase,
  runExistingProfileWritePhase,
  runProfileWritePhase,
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

async function completedUploadLedger() {
  const inputs = realInputs();
  const ledger = createLedger(inputs, "2026-08-31T08:00:00.000Z");
  let nextStorage = 0;
  const dependencies = {
    generateUploadUrl: async () => "https://glad-minnow-656.convex.cloud/opaque",
    upload: async () => ({ storageId: `storage-${++nextStorage}` }),
    dryRunProfiles: async () => ({
      created: 8,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      blocked: 0,
    }),
    persist: vi.fn(),
    now: () => "2026-08-31T08:01:00.000Z",
  };
  await runUploadPhase("canary", inputs, ledger, dependencies);
  await runUploadPhase("remaining", inputs, ledger, dependencies);
  return { inputs, ledger };
}

async function verifiedEightProfileLedger() {
  const completed = await completedUploadLedger();
  const payload = buildEightProfilePayload(
    completed.inputs,
    new Map(completed.ledger.uploads.map((row) => [row.key, row.storageId!])),
  );
  await runProfileWritePhase(completed.inputs, completed.ledger, {
    writeProfiles: async () => createdResult(payload),
    readProfiles: async () => exactReadback(payload),
    persist: vi.fn(),
  });
  return completed;
}

function exactReadback(payload: ReturnType<typeof buildEightProfilePayload>) {
  return payload.entries.map((entry) => {
    if (entry.outcome !== "reviewed-new") throw new Error("test payload drifted");
    return {
      _id: `profile-${entry.profile.key}`,
      key: entry.profile.key,
      displayName: entry.profile.displayName,
      aliases: entry.profile.aliases,
      ...(entry.profile.avatarStorageId
        ? { avatarStorageId: entry.profile.avatarStorageId }
        : {}),
      bio: entry.profile.bio,
      ...(entry.profile.role ? { role: entry.profile.role } : {}),
      links: entry.profile.links,
    };
  });
}

function createdResult(payload: ReturnType<typeof buildEightProfilePayload>) {
  return {
    operationId: payload.operationId,
    dryRun: false,
    created: 8,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    blocked: 0,
    rows: payload.entries.map((entry) => ({
      creatorName: entry.creatorName,
      key: entry.outcome === "reviewed-new" ? entry.profile.key : null,
      profileId: entry.outcome === "reviewed-new" ? `profile-${entry.profile.key}` : null,
      action: "created" as const,
    })),
  };
}

function existingCurrentRows(inputs: ReturnType<typeof realInputs>) {
  return inputs.projection.existingProfiles.map((profile) => ({
    _id: profile.profileId,
    key: profile.key,
    displayName: profile.displayName,
    aliases: [],
    ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
    bio: "",
    links: profile.existingLinks,
  }));
}

function existingResult(
  payload: ReturnType<typeof buildExistingProfilePayload>,
  dryRun: boolean,
) {
  const rows = payload.entries.map((entry) => {
    if (entry.outcome !== "existing-profile") throw new Error("test existing payload drifted");
    const unchanged = JSON.stringify(entry.expected) === JSON.stringify(entry.profile);
    return {
      creatorName: entry.creatorName,
      key: entry.profile.key,
      profileId: entry.profileId,
      action: unchanged ? "unchanged" as const : dryRun ? "would-update" as const : "updated" as const,
    };
  });
  return {
    operationId: payload.operationId,
    dryRun,
    created: 0,
    updated: 3,
    unchanged: 1,
    skipped: 0,
    blocked: 0,
    rows,
  };
}

function exactExistingReadback(payload: ReturnType<typeof buildExistingProfilePayload>) {
  return payload.entries.map((entry) => {
    if (entry.outcome !== "existing-profile") throw new Error("test existing payload drifted");
    return {
      _id: entry.profileId,
      key: entry.profile.key,
      displayName: entry.profile.displayName,
      aliases: entry.profile.aliases,
      ...(entry.profile.avatarStorageId
        ? { avatarStorageId: entry.profile.avatarStorageId }
        : {}),
      ...(entry.profile.avatarR2Key ? { avatarR2Key: entry.profile.avatarR2Key } : {}),
      ...(entry.profile.avatarUrl ? { avatarUrl: entry.profile.avatarUrl } : {}),
      bio: entry.profile.bio,
      ...(entry.profile.role ? { role: entry.profile.role } : {}),
      links: entry.profile.links,
    };
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
    const staleContract = createLedger(inputs) as AvatarUploadLedger;
    staleContract.applicationContractSha256 = "0".repeat(64);
    expect(() => validateLedger(staleContract, inputs)).toThrow(/stale or targets the wrong/);

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

  it("gates the profile write until all uploads and the exact expectedAbsent dry run pass", async () => {
    const inputs = realInputs();
    const ledger = createLedger(inputs);
    const writeProfiles = vi.fn();
    const readProfiles = vi.fn();
    await expect(runProfileWritePhase(inputs, ledger, {
      writeProfiles,
      readProfiles,
      persist: vi.fn(),
    })).rejects.toThrow(/All four digest-bound avatar uploads/);
    expect(writeProfiles).not.toHaveBeenCalled();
    expect(readProfiles).not.toHaveBeenCalled();

    const completed = await completedUploadLedger();
    completed.ledger.profileDryRuns.find((run) => run.phase === "remaining")!.result = {
      created: 7,
      updated: 0,
      unchanged: 1,
      skipped: 0,
      blocked: 0,
    };
    await expect(runProfileWritePhase(completed.inputs, completed.ledger, {
      writeProfiles,
      readProfiles,
      persist: vi.fn(),
    })).rejects.toThrow(/expectedAbsent profiles would be created/);
    expect(writeProfiles).not.toHaveBeenCalled();
  });

  it("marks the outcome uncertain before one write and verifies the exact eight-profile readback", async () => {
    const { inputs, ledger } = await completedUploadLedger();
    const payload = buildEightProfilePayload(
      inputs,
      new Map(ledger.uploads.map((row) => [row.key, row.storageId!])),
    );
    const snapshots: string[] = [];
    const writeProfiles = vi.fn(async (writePayload) => {
      expect(writePayload.dryRun).toBe(false);
      expect(JSON.parse(snapshots[snapshots.length - 1]!).profileWrite.status).toBe("uncertain");
      return createdResult(payload);
    });
    const readProfiles = vi.fn(async () => exactReadback(payload));

    await runProfileWritePhase(inputs, ledger, {
      writeProfiles,
      readProfiles,
      persist: (value) => snapshots.push(JSON.stringify(value)),
      now: () => "2026-08-31T09:00:00.000Z",
    });

    expect(writeProfiles).toHaveBeenCalledTimes(1);
    expect(readProfiles).toHaveBeenCalledWith(payload.entries.map((entry) => (
      entry.outcome === "reviewed-new" ? entry.profile.key : ""
    )));
    expect(ledger.profileWrite).toMatchObject({
      status: "verified",
      attempts: 1,
      expectedAbsent: true,
      errorCode: null,
    });
    expect(ledger.profileWrite.readback).toHaveLength(8);
    expect(snapshots.join("\n")).not.toContain("apiKey");
  });

  it("never retries an uncertain mutation and can recover only through exact readback", async () => {
    const { inputs, ledger } = await completedUploadLedger();
    const payload = buildEightProfilePayload(
      inputs,
      new Map(ledger.uploads.map((row) => [row.key, row.storageId!])),
    );
    const writeProfiles = vi.fn(async () => { throw new Error("response lost"); });
    const firstRead = vi.fn(async () => []);
    await expect(runProfileWritePhase(inputs, ledger, {
      writeProfiles,
      readProfiles: firstRead,
      persist: vi.fn(),
    })).rejects.toThrow(/remains uncertain/);
    expect(ledger.profileWrite.status).toBe("uncertain");
    expect(writeProfiles).toHaveBeenCalledTimes(1);

    await runProfileWritePhase(inputs, ledger, {
      writeProfiles,
      readProfiles: async () => exactReadback(payload),
      persist: vi.fn(),
    });
    expect(writeProfiles).toHaveBeenCalledTimes(1);
    expect(ledger.profileWrite.status).toBe("verified");
    expect(ledger.profileWrite.result).toBeNull();
  });

  it("keeps a successful mutation uncertain when exact readback mismatches", async () => {
    const { inputs, ledger } = await completedUploadLedger();
    const payload = buildEightProfilePayload(
      inputs,
      new Map(ledger.uploads.map((row) => [row.key, row.storageId!])),
    );
    const readback = exactReadback(payload);
    readback[0] = { ...readback[0], displayName: "Wrong artist" };
    await expect(runProfileWritePhase(inputs, ledger, {
      writeProfiles: async () => createdResult(payload),
      readProfiles: async () => readback,
      persist: vi.fn(),
    })).rejects.toThrow(/exact eight-profile readback did not verify/);
    expect(ledger.profileWrite).toMatchObject({
      status: "uncertain",
      errorCode: "profile-readback-mismatch-or-unavailable",
    });
  });

  it("treats a verified resume as a no-op and never calls the mutation twice", async () => {
    const { inputs, ledger } = await completedUploadLedger();
    const payload = buildEightProfilePayload(
      inputs,
      new Map(ledger.uploads.map((row) => [row.key, row.storageId!])),
    );
    const writeProfiles = vi.fn(async () => createdResult(payload));
    const readProfiles = vi.fn(async () => exactReadback(payload));
    await runProfileWritePhase(inputs, ledger, {
      writeProfiles,
      readProfiles,
      persist: vi.fn(),
    });
    const resumed = await runProfileWritePhase(inputs, ledger, {
      writeProfiles,
      readProfiles,
      persist: vi.fn(),
    });
    expect(resumed.resumed).toBe(true);
    expect(writeProfiles).toHaveBeenCalledTimes(1);
    expect(readProfiles).toHaveBeenCalledTimes(1);
  });

  it("builds the exact four-profile CAS payload with five additions and the three-link cap", () => {
    const inputs = realInputs();
    const payload = buildExistingProfilePayload(inputs, existingCurrentRows(inputs), true);
    expect(payload.dryRun).toBe(true);
    expect(payload.entries).toHaveLength(4);
    expect(payload.entries.every((entry) => entry.outcome === "existing-profile")).toBe(true);
    const existingEntries = payload.entries.filter((entry) => entry.outcome === "existing-profile");
    expect(existingEntries.map((entry) => entry.profileId).sort()).toEqual(
      inputs.projection.existingProfiles.map((profile) => profile.profileId).sort(),
    );
    expect(existingEntries.reduce(
      (count, entry) => count + entry.profile.links.length - entry.expected.links.length,
      0,
    )).toBe(5);
    expect(existingEntries.every((entry) => entry.profile.links.length <= 3)).toBe(true);
    const angus = existingEntries.find((entry) => entry.profile.key === "ANGUSLONG")!;
    expect(angus.profile.links).toHaveLength(3);
    expect(angus.profile.links.some((link) => link.url.includes("reddit.com"))).toBe(false);
    const simon = existingEntries.find((entry) => entry.profile.key === "SIMONHAIDUK")!;
    expect(simon.profile.links.every((link) => link.label.length <= 60)).toBe(true);
  });

  it("requires the verified eight-create ledger before recording the separate existing dry run", async () => {
    const inputs = realInputs();
    const unverified = createLedger(inputs);
    const readProfiles = vi.fn();
    const dryRunProfiles = vi.fn();
    await expect(runExistingProfileDryRunPhase(inputs, unverified, {
      readProfiles,
      dryRunProfiles,
      persist: vi.fn(),
    })).rejects.toThrow(/original eight-profile create phase must be verified|All four digest-bound/);
    expect(readProfiles).not.toHaveBeenCalled();
    expect(dryRunProfiles).not.toHaveBeenCalled();

    const completed = await verifiedEightProfileLedger();
    delete completed.ledger.existingProfileDryRun;
    delete completed.ledger.existingProfileWrite;
    const originalCreateLedger = structuredClone({
      uploads: completed.ledger.uploads,
      profileDryRuns: completed.ledger.profileDryRuns,
      profileWrite: completed.ledger.profileWrite,
    });
    const expectedPayload = buildExistingProfilePayload(
      completed.inputs,
      existingCurrentRows(completed.inputs),
      true,
    );
    const persist = vi.fn();
    const result = await runExistingProfileDryRunPhase(completed.inputs, completed.ledger, {
      readProfiles: async (keys) => {
        expect(keys).toEqual(["ANGUSLONG", "LARRYCARLSON", "SAMPERKINS", "SIMONHAIDUK"]);
        return existingCurrentRows(completed.inputs);
      },
      dryRunProfiles: async (payload) => {
        expect(payload.dryRun).toBe(true);
        return existingResult(expectedPayload, true);
      },
      persist,
      now: () => "2026-08-31T11:00:00.000Z",
    });
    expect(result.result).toMatchObject({ updated: 3, unchanged: 1, blocked: 0 });
    expect(result.ledger.existingProfileDryRun?.payload.entries).toHaveLength(4);
    expect(persist).toHaveBeenCalledTimes(1);
    expect({
      uploads: result.ledger.uploads,
      profileDryRuns: result.ledger.profileDryRuns,
      profileWrite: result.ledger.profileWrite,
    }).toEqual(originalCreateLedger);
  });

  it("marks existing-profile write uncertain before one mutation and verifies exact readback", async () => {
    const completed = await verifiedEightProfileLedger();
    const dryRunPayload = buildExistingProfilePayload(
      completed.inputs,
      existingCurrentRows(completed.inputs),
      true,
    );
    await runExistingProfileDryRunPhase(completed.inputs, completed.ledger, {
      readProfiles: async () => existingCurrentRows(completed.inputs),
      dryRunProfiles: async () => existingResult(dryRunPayload, true),
      persist: vi.fn(),
    });
    const writePayload = { ...dryRunPayload, dryRun: false };
    const originalCreateLedger = structuredClone({
      uploads: completed.ledger.uploads,
      profileDryRuns: completed.ledger.profileDryRuns,
      profileWrite: completed.ledger.profileWrite,
    });
    const snapshots: string[] = [];
    const writeProfiles = vi.fn(async (payload) => {
      expect(payload.dryRun).toBe(false);
      expect(JSON.parse(snapshots[snapshots.length - 1]!).existingProfileWrite.status)
        .toBe("uncertain");
      return existingResult(writePayload, false);
    });
    const readProfiles = vi.fn(async () => exactExistingReadback(writePayload));
    await runExistingProfileWritePhase(completed.inputs, completed.ledger, {
      writeProfiles,
      readProfiles,
      persist: (ledger) => snapshots.push(JSON.stringify(ledger)),
      now: () => "2026-08-31T11:01:00.000Z",
    });
    expect(writeProfiles).toHaveBeenCalledTimes(1);
    expect(completed.ledger.existingProfileWrite).toMatchObject({
      status: "verified",
      attempts: 1,
      errorCode: null,
    });
    expect(completed.ledger.existingProfileWrite?.readback).toHaveLength(4);
    expect({
      uploads: completed.ledger.uploads,
      profileDryRuns: completed.ledger.profileDryRuns,
      profileWrite: completed.ledger.profileWrite,
    }).toEqual(originalCreateLedger);
    expect(snapshots.join("\n")).not.toContain("apiKey");
  });

  it("rejects a self-consistent ledger payload redirected away from the pinned projection", async () => {
    const completed = await verifiedEightProfileLedger();
    const dryRunPayload = buildExistingProfilePayload(
      completed.inputs,
      existingCurrentRows(completed.inputs),
      true,
    );
    await runExistingProfileDryRunPhase(completed.inputs, completed.ledger, {
      readProfiles: async () => existingCurrentRows(completed.inputs),
      dryRunProfiles: async () => existingResult(dryRunPayload, true),
      persist: vi.fn(),
    });
    const dryRun = completed.ledger.existingProfileDryRun!;
    const angus = dryRun.payload.entries.find(
      (entry) => entry.outcome === "existing-profile" && entry.profile.key === "ANGUSLONG",
    );
    if (!angus || angus.outcome !== "existing-profile") throw new Error("missing Angus test entry");
    angus.profile.links[0] = { label: "redirected", url: "https://attacker.example/" };
    dryRun.payloadSha256 = createHash("sha256")
      .update(`${JSON.stringify(dryRun.payload)}\n`)
      .digest("hex");
    const writeProfiles = vi.fn();
    await expect(runExistingProfileWritePhase(completed.inputs, completed.ledger, {
      writeProfiles,
      readProfiles: vi.fn(),
      persist: vi.fn(),
    })).rejects.toThrow(/payload links drifted/);
    expect(writeProfiles).not.toHaveBeenCalled();
  });

  it("never retries an uncertain existing-profile mutation and recovers by exact readback", async () => {
    const completed = await verifiedEightProfileLedger();
    const dryRunPayload = buildExistingProfilePayload(
      completed.inputs,
      existingCurrentRows(completed.inputs),
      true,
    );
    await runExistingProfileDryRunPhase(completed.inputs, completed.ledger, {
      readProfiles: async () => existingCurrentRows(completed.inputs),
      dryRunProfiles: async () => existingResult(dryRunPayload, true),
      persist: vi.fn(),
    });
    const writePayload = { ...dryRunPayload, dryRun: false };
    const writeProfiles = vi.fn(async () => { throw new Error("response lost"); });
    await expect(runExistingProfileWritePhase(completed.inputs, completed.ledger, {
      writeProfiles,
      readProfiles: async () => [],
      persist: vi.fn(),
    })).rejects.toThrow(/remains uncertain/);
    expect(writeProfiles).toHaveBeenCalledTimes(1);
    await runExistingProfileWritePhase(completed.inputs, completed.ledger, {
      writeProfiles,
      readProfiles: async () => exactExistingReadback(writePayload),
      persist: vi.fn(),
    });
    expect(writeProfiles).toHaveBeenCalledTimes(1);
    expect(completed.ledger.existingProfileWrite).toMatchObject({
      status: "verified",
      result: null,
    });
  });

  it("keeps existing-profile readback mismatch uncertain and makes verified resume a no-op", async () => {
    const completed = await verifiedEightProfileLedger();
    const dryRunPayload = buildExistingProfilePayload(
      completed.inputs,
      existingCurrentRows(completed.inputs),
      true,
    );
    await runExistingProfileDryRunPhase(completed.inputs, completed.ledger, {
      readProfiles: async () => existingCurrentRows(completed.inputs),
      dryRunProfiles: async () => existingResult(dryRunPayload, true),
      persist: vi.fn(),
    });
    const writePayload = { ...dryRunPayload, dryRun: false };
    const mismatched = exactExistingReadback(writePayload);
    mismatched[0] = { ...mismatched[0], aliases: ["drift"] };
    const writeProfiles = vi.fn(async () => existingResult(writePayload, false));
    await expect(runExistingProfileWritePhase(completed.inputs, completed.ledger, {
      writeProfiles,
      readProfiles: async () => mismatched,
      persist: vi.fn(),
    })).rejects.toThrow(/remains uncertain/);
    expect(completed.ledger.existingProfileWrite?.status).toBe("uncertain");

    await runExistingProfileWritePhase(completed.inputs, completed.ledger, {
      writeProfiles,
      readProfiles: async () => exactExistingReadback(writePayload),
      persist: vi.fn(),
    });
    const readProfiles = vi.fn();
    const resumed = await runExistingProfileWritePhase(completed.inputs, completed.ledger, {
      writeProfiles,
      readProfiles,
      persist: vi.fn(),
    });
    expect(resumed.resumed).toBe(true);
    expect(writeProfiles).toHaveBeenCalledTimes(1);
    expect(readProfiles).not.toHaveBeenCalled();
  });

  it("builds a nonsecret exact 160-profile snapshot only after both rollout phases verify", async () => {
    const completed = await verifiedEightProfileLedger();
    expect(() => buildContributorProfileSnapshot(completed.inputs, completed.ledger, [], []))
      .toThrow(/Existing-profile rollout must be verified/);
    const dryRunPayload = buildExistingProfilePayload(
      completed.inputs,
      existingCurrentRows(completed.inputs),
      true,
    );
    await runExistingProfileDryRunPhase(completed.inputs, completed.ledger, {
      readProfiles: async () => existingCurrentRows(completed.inputs),
      dryRunProfiles: async () => existingResult(dryRunPayload, true),
      persist: vi.fn(),
    });
    const writePayload = { ...dryRunPayload, dryRun: false };
    await runExistingProfileWritePhase(completed.inputs, completed.ledger, {
      writeProfiles: async () => existingResult(writePayload, false),
      readProfiles: async () => exactExistingReadback(writePayload),
      persist: vi.fn(),
    });
    const campaignRows = [
      ...completed.ledger.profileWrite.readback!,
      ...completed.ledger.existingProfileWrite!.readback!,
    ].map((row) => ({
      _id: row.profileId,
      key: row.key,
      displayName: row.displayName,
      aliases: row.aliases,
      ...(row.avatarStorageId ? { avatarStorageId: row.avatarStorageId } : {}),
      ...(row.avatarR2Key ? { avatarR2Key: row.avatarR2Key } : {}),
      ...(row.avatarUrl ? { avatarUrl: row.avatarUrl } : {}),
      bio: row.bio,
      ...(row.role ? { role: row.role } : {}),
      links: row.links,
      membershipEmail: "must-not-be-preserved@example.invalid",
    }));
    const fillerRows = Array.from({ length: 148 }, (_, index) => ({
      _id: `profile-filler-${index}`,
      key: `PROFILE-${String(index).padStart(3, "0")}`,
      displayName: `Profile ${index}`,
      aliases: [],
      bio: "",
      links: [],
      membershipEmail: "must-not-be-preserved@example.invalid",
    }));
    const rows = [...campaignRows, ...fillerRows];
    const keys = rows.map((row) => row.key);
    const snapshot = buildContributorProfileSnapshot(
      completed.inputs,
      completed.ledger,
      keys,
      rows,
      "2026-08-31T11:02:00.000Z",
    );
    expect(snapshot.profileCount).toBe(160);
    expect(snapshot.profiles).toHaveLength(160);
    expect(completed.inputs.projection.createProfiles.every((profile) =>
      snapshot.profiles.some((row) => row.key === profile.key))).toBe(true);
    expect(snapshot.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(snapshot)).not.toContain("membershipEmail");
    expect(JSON.stringify(snapshot)).not.toContain("must-not-be-preserved");
  });
});
