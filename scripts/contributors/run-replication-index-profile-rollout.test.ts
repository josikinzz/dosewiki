import { mkdtempSync, readFileSync, statSync } from "node:fs";
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
  type ProfileRolloutLedger,
  type RolloutDependencies,
} from "./run-replication-index-profile-rollout";

const scopedEnv = { CONVEX_ADMIN_TOKEN_PROFILE_MEDIA_WRITE: "test-scoped-profile-token" };
const targetFlags = [
  `--target-url=${EXPECTED_TARGET_URL}`,
  "--expected-deployment=glad-minnow-656",
];

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

function exactRows(entries: Array<Record<string, any>>) {
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
  it("validates the exact pinned 1,979-profile, 40-batch materialization", () => {
    const plan = validateMaterialization();
    expect(plan.counts.profileOperations).toBe(1979);
    expect(plan.batches).toHaveLength(40);
    expect(Math.max(...plan.batches.map((batch) => batch.entryCount))).toBe(50);
  });

  it("defaults to a local dry run with zero network calls", async () => {
    const deps = dependencies();
    const result = await runProfileRollout({ argv: [], env: {}, dependencies: deps });
    expect(result).toMatchObject({ mode: "local-dry-run", rows: 1979, networkCalls: 0 });
    expect(deps.dryRunBatch).not.toHaveBeenCalled();
    expect(deps.writeBatch).not.toHaveBeenCalled();
    expect(deps.readProfiles).not.toHaveBeenCalled();
  });

  it("uses the deployed import mutation with dryRun true for a live dry run", async () => {
    const dryRunBatch = vi.fn(async (payload: any, _token: string) => dryRunResult(payload));
    const deps = dependencies({ dryRunBatch });
    const result = await runProfileRollout({
      argv: ["--live-dry-run", ...targetFlags],
      env: scopedEnv,
      dependencies: deps,
    });
    expect(result).toMatchObject({ batches: 40, rows: 1979, wrote: false });
    expect(dryRunBatch).toHaveBeenCalledTimes(40);
    expect(dryRunBatch.mock.calls.every(([payload, token]) => payload.dryRun === true && token === scopedEnv.CONVEX_ADMIN_TOKEN_PROFILE_MEDIA_WRITE)).toBe(true);
    expect(deps.writeBatch).not.toHaveBeenCalled();
    expect(deps.readProfiles).not.toHaveBeenCalled();
  });

  it("rejects missing or legacy-only credentials before any network call", async () => {
    const deps = dependencies();
    await expect(runProfileRollout({
      argv: ["--live-dry-run", ...targetFlags],
      env: {},
      dependencies: deps,
    })).rejects.toThrow(/Missing admin token/);
    await expect(runProfileRollout({
      argv: ["--live-dry-run", ...targetFlags],
      env: { CONVEX_ADMIN_KEY: "legacy-broad-token" },
      dependencies: deps,
    })).rejects.toThrow(/legacy broad admin key is not accepted/);
    expect(deps.dryRunBatch).not.toHaveBeenCalled();
  });

  it("refuses remaining batches until the canary has exact-readback verification", async () => {
    const plan = validateMaterialization();
    const ledger = createLedger(plan);
    const deps = dependencies();
    await expect(runWritePhase("remaining", plan, ledger, "token", deps))
      .rejects.toThrow(/Canary batch must be verified/);
    expect(deps.writeBatch).not.toHaveBeenCalled();
  });

  it("persists uncertain before one canary mutation and stops on readback mismatch", async () => {
    const plan = validateMaterialization();
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
    const plan = validateMaterialization();
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

  it("writes a secret-free atomic 0600 ledger", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "profile-rollout-"));
    const ledgerPath = path.join(directory, "ledger.json");
    const plan = validateMaterialization();
    const firstBatch = plan.batches[0]!;
    await runProfileRollout({
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
    expect(JSON.parse(text).batches[0].status).toBe("verified");
  });

  it("derives pinned rollback payloads and rolls verified batches back in reverse order", async () => {
    const plan = validateMaterialization();
    const ledger = createLedger(plan);
    ledger.batches.forEach((row) => { row.status = "verified"; });
    const calls: string[] = [];
    const rollbackBatch = vi.fn(async (payload: any) => {
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
    expect(rollbackBatch).toHaveBeenCalledTimes(40);
  });

  it("reconciles an uncertain rollback only by exact absent/restored readback", async () => {
    const plan = validateMaterialization();
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
    const plan = validateMaterialization();
    const ledger = createLedger(plan);
    ledger.batches[0]!.status = "rollback-uncertain";
    const deps = dependencies({
      readProfiles: vi.fn(async () => [{
        ...exactRows([plan.batches[0]!.payload.entries[0] as any])[0],
        displayName: "drifted",
      }]),
    });
    await expect(runRollbackPhase(plan, ledger, "token", deps))
      .rejects.toThrow(/rollback remains uncertain.*do not retry/);
    await expect(runRollbackPhase(plan, ledger, "token", deps))
      .rejects.toThrow(/rollback remains uncertain.*do not retry/);
    expect(deps.rollbackBatch).not.toHaveBeenCalled();
  });

  it("supports a reverse-order live rollback dry run without writing a ledger", async () => {
    const rollbackBatch = vi.fn(async (payload: any) => rollbackDryRunResult(payload));
    const deps = dependencies({ rollbackBatch });
    const result = await runProfileRollout({
      argv: ["--live-dry-run", "--phase=rollback", ...targetFlags],
      env: scopedEnv,
      dependencies: deps,
    });
    expect(result).toMatchObject({ phase: "rollback", batches: 40, rows: 1979, wrote: false });
    expect(rollbackBatch).toHaveBeenCalledTimes(40);
    const batches = validateMaterialization().batches;
    expect(rollbackBatch.mock.calls[0]![0].operationId)
      .toBe(batches[batches.length - 1]!.payload.operationId);
    expect(deps.writeBatch).not.toHaveBeenCalled();
  });
});
