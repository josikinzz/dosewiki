import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  createLedger,
  EXPECTED_TARGET_URL,
  rollbackPayloadFor,
  runProfileRollout,
  runRollbackPhase,
  runWritePhase,
  validateMaterialization,
  type MaterializationPins,
  type ProfileRolloutLedger,
  type RolloutDependencies,
  type ValidatedMaterialization,
} from "./run-replication-index-profile-rollout";

// A small synthetic materialization with the same shape as the campaign
// artifact: three batches (canary plus two remaining), a mix of reviewed-new
// and existing-profile entries, and self-consistent payload/content digests.
// The pins are literal so that any edit to the fixture fails the suite the
// same way a drifted campaign artifact would.
const FIXTURE_PLAN = path.join(import.meta.dirname, "fixtures/replication-index-profile-materialization.json");
const FIXTURE_PINS: MaterializationPins = {
  fileSha256: "0ad205c341028587f93fbfb8264b2a4525f139173bd5dd21733c544ce58fff4a",
  contentSha256: "4b093442282defa16de20abd21d45f5869a5969dc929a765d2bfdf4f7eef5a52",
};
const FIXTURE_ROWS = 8;
const FIXTURE_BATCHES = 3;

const scopedEnv = { CONVEX_ADMIN_TOKEN_PROFILE_MEDIA_WRITE: "test-scoped-profile-token" } as unknown as NodeJS.ProcessEnv;
const targetFlags = [
  `--target-url=${EXPECTED_TARGET_URL}`,
  "--expected-deployment=glad-minnow-656",
];

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function fixturePlan() {
  return validateMaterialization(FIXTURE_PLAN, FIXTURE_PINS);
}

function rollout(options: { argv: string[]; env: NodeJS.ProcessEnv; dependencies: Partial<RolloutDependencies> }) {
  return runProfileRollout({ ...options, argv: ["--plan", FIXTURE_PLAN, ...options.argv], pins: FIXTURE_PINS });
}

function temporaryPlan(mutate: (plan: ValidatedMaterialization) => void, transformText: (text: string) => string = (text) => text) {
  const directory = mkdtempSync(path.join(tmpdir(), "profile-materialization-"));
  const planPath = path.join(directory, "plan.json");
  const plan = JSON.parse(readFileSync(FIXTURE_PLAN, "utf8"));
  mutate(plan);
  const text = transformText(`${JSON.stringify(plan, null, 2)}\n`);
  writeFileSync(planPath, text);
  return { planPath, fileSha256: sha256(text) };
}

function dryRunResult(payload: { operationId: string; entries: unknown[] }) {
  return {
    operationId: payload.operationId,
    dryRun: true,
    created: payload.entries.length,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    blocked: 0,
    rows: payload.entries.map(() => ({})),
  };
}

function rollbackDryRunResult(payload: { operationId: string; entries: unknown[] }) {
  return {
    operationId: payload.operationId,
    dryRun: true,
    deleted: 0,
    restored: payload.entries.length,
    unchanged: 0,
    skipped: 0,
    rows: payload.entries.map(() => ({})),
  };
}

type Entry = ValidatedMaterialization["batches"][number]["payload"]["entries"][number];
type Payload = ValidatedMaterialization["batches"][number]["payload"];

function exactRows(entries: Entry[]) {
  return entries.map((entry) => ({
    _id: entry.outcome === "existing-profile" ? entry.profileId : `new-${entry.profile.key}`,
    key: entry.profile.key,
    displayName: entry.profile.displayName,
    aliases: entry.profile.aliases,
    ...(entry.profile.avatarStorageId ? { avatarStorageId: entry.profile.avatarStorageId } : {}),
    ...(entry.profile.avatarR2Key ? { avatarR2Key: entry.profile.avatarR2Key } : {}),
    ...(entry.profile.avatarUrl ? { avatarUrl: entry.profile.avatarUrl } : {}),
    bio: entry.profile.bio,
    ...(entry.profile.role ? { role: entry.profile.role } : {}),
    links: entry.profile.links,
  }));
}

function dependencies(overrides: Partial<RolloutDependencies> = {}): RolloutDependencies {
  return {
    dryRunBatch: vi.fn(async (payload) => dryRunResult(payload)),
    writeBatch: vi.fn(async () => ({})),
    rollbackBatch: vi.fn(async () => ({})),
    readProfiles: vi.fn(async () => []),
    persist: vi.fn(),
    now: () => "2026-08-31T20:00:00.000Z",
    ...overrides,
  };
}

describe("Replication Index profile rollout runner", () => {
  it("validates the pinned materialization and enforces the 50-row batch cap", () => {
    const plan = fixturePlan();
    expect(plan.counts.profileOperations).toBe(FIXTURE_ROWS);
    expect(plan.batches).toHaveLength(FIXTURE_BATCHES);
    expect(plan.fileSha256).toBe(FIXTURE_PINS.fileSha256);
    expect(plan.batches.every((batch) => batch.entryCount > 0 && batch.entryCount <= 50)).toBe(true);
    expect(plan.batches.map((batch) => batch.batchNumber)).toEqual([1, 2, 3]);
  });

  it("refuses file, content, and self-hash drift before trusting any batch", () => {
    const appended = temporaryPlan(() => {}, (text) => `${text} `);
    expect(() => validateMaterialization(appended.planPath, FIXTURE_PINS))
      .toThrow(/file hash mismatch/);

    const redeclared = temporaryPlan((plan) => { plan.contentSha256 = "0".repeat(64); });
    expect(() => validateMaterialization(redeclared.planPath, { ...FIXTURE_PINS, fileSha256: redeclared.fileSha256 }))
      .toThrow(/content hash mismatch/);

    const edited = temporaryPlan((plan) => { plan.batches[0].payload.entries[0].profile.displayName = "Tampered"; });
    expect(() => validateMaterialization(edited.planPath, { ...FIXTURE_PINS, fileSha256: edited.fileSha256 }))
      .toThrow(/self-hash mismatch/);
  });

  it("defaults to a local dry run with zero network calls", async () => {
    const deps = dependencies();
    const result = await rollout({ argv: [], env: {} as unknown as NodeJS.ProcessEnv, dependencies: deps });
    expect(result).toMatchObject({ mode: "local-dry-run", rows: FIXTURE_ROWS, batches: FIXTURE_BATCHES, networkCalls: 0 });
    expect(deps.dryRunBatch).not.toHaveBeenCalled();
    expect(deps.writeBatch).not.toHaveBeenCalled();
    expect(deps.readProfiles).not.toHaveBeenCalled();
  });

  it("uses the deployed import mutation with dryRun true for a live dry run", async () => {
    const dryRunBatch = vi.fn(async (payload: Payload, _token: string) => dryRunResult(payload));
    const deps = dependencies({ dryRunBatch });
    const result = await rollout({
      argv: ["--live-dry-run", ...targetFlags],
      env: scopedEnv,
      dependencies: deps,
    });
    expect(result).toMatchObject({ batches: FIXTURE_BATCHES, rows: FIXTURE_ROWS, wrote: false });
    expect(dryRunBatch).toHaveBeenCalledTimes(FIXTURE_BATCHES);
    expect(dryRunBatch.mock.calls.every(([payload, token]) => payload.dryRun === true && token === scopedEnv.CONVEX_ADMIN_TOKEN_PROFILE_MEDIA_WRITE)).toBe(true);
    expect(deps.writeBatch).not.toHaveBeenCalled();
    expect(deps.readProfiles).not.toHaveBeenCalled();
  });

  it("rejects missing or legacy-only credentials before any network call", async () => {
    const deps = dependencies();
    await expect(rollout({
      argv: ["--live-dry-run", ...targetFlags],
      env: {} as unknown as NodeJS.ProcessEnv,
      dependencies: deps,
    })).rejects.toThrow(/Missing admin token/);
    await expect(rollout({
      argv: ["--live-dry-run", ...targetFlags],
      env: { CONVEX_ADMIN_KEY: "legacy-broad-token" } as unknown as NodeJS.ProcessEnv,
      dependencies: deps,
    })).rejects.toThrow(/legacy broad admin key is not accepted/);
    expect(deps.dryRunBatch).not.toHaveBeenCalled();
  });

  it("refuses remaining batches until the canary has exact-readback verification", async () => {
    const plan = fixturePlan();
    const ledger = createLedger(plan);
    const deps = dependencies();
    await expect(runWritePhase("remaining", plan, ledger, "token", deps))
      .rejects.toThrow(/Canary batch must be verified/);
    expect(deps.writeBatch).not.toHaveBeenCalled();
  });

  it("writes the canary first and only then the remaining batches in order", async () => {
    const plan = fixturePlan();
    const ledger = createLedger(plan);
    const written: string[] = [];
    const entriesByKeys = new Map(plan.batches.map((batch) => [
      batch.payload.entries.map((entry) => entry.profile.key).join("\n"),
      batch.payload.entries,
    ]));
    const deps = dependencies({
      writeBatch: vi.fn(async (payload: Payload) => { written.push(payload.operationId); return {}; }),
      readProfiles: vi.fn(async (keys) => exactRows(entriesByKeys.get(keys.join("\n"))!)),
    });
    await runWritePhase("canary", plan, ledger, "token", deps);
    expect(written).toEqual([plan.batches[0]!.payload.operationId]);
    expect(ledger.batches.map((row) => row.status)).toEqual(["verified", "pending", "pending"]);

    await runWritePhase("remaining", plan, ledger, "token", deps);
    expect(written).toEqual(plan.batches.map((batch) => batch.payload.operationId));
    expect(ledger.batches.every((row) => row.status === "verified")).toBe(true);
  });

  it("persists uncertain before one canary mutation and stops on readback mismatch", async () => {
    const plan = fixturePlan();
    const ledger = createLedger(plan);
    const snapshots: ProfileRolloutLedger[] = [];
    const writeBatch = vi.fn(async () => ({}));
    const deps = dependencies({
      writeBatch,
      readProfiles: vi.fn(async () => []),
      persist: (value) => snapshots.push(structuredClone(value)),
    });
    await expect(runWritePhase("canary", plan, ledger, "token", deps))
      .rejects.toThrow(/remains uncertain.*do not retry/);
    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(snapshots[0]!.batches[0]!.status).toBe("uncertain");
    expect(ledger.batches[0]!.status).toBe("uncertain");

    await expect(runWritePhase("canary", plan, ledger, "token", deps))
      .rejects.toThrow(/remains uncertain.*do not retry/);
    expect(writeBatch).toHaveBeenCalledTimes(1);
  });

  it("recovers an uncertain canary only through exact getForBulkImport-style readback", async () => {
    const plan = fixturePlan();
    const ledger = createLedger(plan);
    ledger.batches[0]!.status = "uncertain";
    const firstBatch = plan.batches[0]!;
    const deps = dependencies({
      readProfiles: vi.fn(async (keys) => {
        expect(keys).toEqual(firstBatch.payload.entries.map((entry) => entry.profile.key));
        return exactRows(firstBatch.payload.entries);
      }),
    });
    await runWritePhase("canary", plan, ledger, "token", deps);
    expect(ledger.batches[0]!.status).toBe("verified");
    expect(deps.writeBatch).not.toHaveBeenCalled();
  });

  it("rejects an existing-profile readback whose document ID differs from the pinned profile", async () => {
    const plan = fixturePlan();
    const ledger = createLedger(plan);
    ledger.batches[0]!.status = "uncertain";
    const firstBatch = plan.batches[0]!;
    const rows = exactRows(firstBatch.payload.entries);
    const existing = firstBatch.payload.entries.findIndex((entry) => entry.outcome === "existing-profile");
    expect(existing).toBeGreaterThanOrEqual(0);
    rows[existing] = { ...rows[existing]!, _id: "kx7someoneelse000000000000000000" };
    const deps = dependencies({ readProfiles: vi.fn(async () => rows) });
    await expect(runWritePhase("canary", plan, ledger, "token", deps))
      .rejects.toThrow(/remains uncertain.*do not retry/);
    expect(ledger.batches[0]!.status).toBe("uncertain");
    expect(deps.writeBatch).not.toHaveBeenCalled();
  });

  it("writes a secret-free atomic 0600 ledger", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "profile-rollout-"));
    const ledgerPath = path.join(directory, "ledger.json");
    const plan = fixturePlan();
    const firstBatch = plan.batches[0]!;
    await rollout({
      argv: [
        "--write", "--phase=canary", ...targetFlags,
        "--confirm-write=replication-index-profile-rollout",
        "--ledger", ledgerPath,
      ],
      env: scopedEnv,
      dependencies: {
        dryRunBatch: vi.fn(async (payload) => dryRunResult(payload)),
        writeBatch: vi.fn(async () => ({})),
        rollbackBatch: vi.fn(async () => ({})),
        readProfiles: vi.fn(async () => exactRows(firstBatch.payload.entries)),
        now: () => "2026-08-31T20:00:00.000Z",
      },
    });
    const text = readFileSync(ledgerPath, "utf8");
    expect(statSync(ledgerPath).mode & 0o777).toBe(0o600);
    expect(text).not.toContain(scopedEnv.CONVEX_ADMIN_TOKEN_PROFILE_MEDIA_WRITE);
    const persisted = JSON.parse(text);
    expect(persisted.batches[0].status).toBe("verified");
    expect(persisted.artifactFileSha256).toBe(FIXTURE_PINS.fileSha256);
    expect(persisted.artifactContentSha256).toBe(FIXTURE_PINS.contentSha256);
  });

  it("refuses a ledger whose artifact lineage does not match the validated plan", async () => {
    const plan = fixturePlan();
    const ledger = createLedger(plan);
    ledger.artifactFileSha256 = "0".repeat(64);
    const deps = dependencies();
    await expect(runWritePhase("canary", plan, ledger, "token", deps))
      .rejects.toThrow(/Ledger artifact file hash mismatch/);
    expect(deps.writeBatch).not.toHaveBeenCalled();
  });

  it("derives pinned rollback payloads and rolls verified batches back in reverse order", async () => {
    const plan = fixturePlan();
    const ledger = createLedger(plan);
    ledger.batches.forEach((row) => { row.status = "verified"; });
    const calls: string[] = [];
    const rollbackBatch = vi.fn(async (payload: Payload) => {
      calls.push(payload.operationId);
      expect(payload).toEqual(rollbackPayloadFor(
        plan.batches.find((batch) => batch.payload.operationId === payload.operationId)!,
        false,
      ));
      return {};
    });
    const entriesByKeys = new Map(plan.batches.map((batch) => [
      batch.payload.entries.map((entry) => entry.profile.key).join("\n"),
      batch.payload.entries,
    ]));
    const deps = dependencies({
      rollbackBatch,
      readProfiles: vi.fn(async (keys) => {
        const entries = entriesByKeys.get(keys.join("\n"))!;
        return exactRows(entries.filter((entry) => entry.outcome === "existing-profile")
          .map((entry) => ({ ...entry, profile: entry.expected })));
      }),
    });
    await runRollbackPhase(plan, ledger, "token", deps);
    expect(calls).toEqual([...plan.batches].reverse().map((batch) => batch.payload.operationId));
    expect(ledger.batches.every((row) => row.status === "rolled-back")).toBe(true);

    await runRollbackPhase(plan, ledger, "token", deps);
    expect(rollbackBatch).toHaveBeenCalledTimes(FIXTURE_BATCHES);
  });

  it("reconciles an uncertain rollback only by exact absent/restored readback", async () => {
    const plan = fixturePlan();
    const ledger = createLedger(plan);
    const batch = plan.batches[0]!;
    ledger.batches[0]!.status = "rollback-uncertain";
    const restored = exactRows(batch.payload.entries.filter((entry) => entry.outcome === "existing-profile")
      .map((entry) => ({ ...entry, profile: entry.expected })));
    const deps = dependencies({ readProfiles: vi.fn(async () => restored) });
    await runRollbackPhase(plan, ledger, "token", deps);
    expect(ledger.batches[0]!.status).toBe("rolled-back");
    expect(deps.rollbackBatch).not.toHaveBeenCalled();
  });

  it("stops an uncertain rollback on drift and never retries the mutation", async () => {
    const plan = fixturePlan();
    const ledger = createLedger(plan);
    ledger.batches[0]!.status = "rollback-uncertain";
    const deps = dependencies({
      readProfiles: vi.fn(async () => [{
        ...exactRows([plan.batches[0]!.payload.entries[0]!])[0],
        displayName: "drifted",
      }]),
    });
    await expect(runRollbackPhase(plan, ledger, "token", deps))
      .rejects.toThrow(/rollback remains uncertain.*do not retry/);
    await expect(runRollbackPhase(plan, ledger, "token", deps))
      .rejects.toThrow(/rollback remains uncertain.*do not retry/);
    expect(deps.rollbackBatch).not.toHaveBeenCalled();
  });

  it("blocks rollback while any apply batch is still uncertain", async () => {
    const plan = fixturePlan();
    const ledger = createLedger(plan);
    ledger.batches[0]!.status = "verified";
    ledger.batches[1]!.status = "uncertain";
    const deps = dependencies();
    await expect(runRollbackPhase(plan, ledger, "token", deps))
      .rejects.toThrow(/blocked by uncertain apply batches: 2/);
    expect(deps.rollbackBatch).not.toHaveBeenCalled();
  });

  it("supports a reverse-order live rollback dry run without writing a ledger", async () => {
    const rollbackBatch = vi.fn(async (payload: Payload) => rollbackDryRunResult(payload));
    const deps = dependencies({ rollbackBatch });
    const result = await rollout({
      argv: ["--live-dry-run", "--phase=rollback", ...targetFlags],
      env: scopedEnv,
      dependencies: deps,
    });
    expect(result).toMatchObject({ phase: "rollback", batches: FIXTURE_BATCHES, rows: FIXTURE_ROWS, wrote: false });
    expect(rollbackBatch).toHaveBeenCalledTimes(FIXTURE_BATCHES);
    const batches = fixturePlan().batches;
    expect(rollbackBatch.mock.calls[0]![0].operationId)
      .toBe(batches[batches.length - 1]!.payload.operationId);
    expect(deps.writeBatch).not.toHaveBeenCalled();
  });
});
