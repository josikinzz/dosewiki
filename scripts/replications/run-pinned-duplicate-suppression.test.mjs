import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { digestValue, runPinnedDuplicateSuppression } from "./run-pinned-duplicate-suppression.mjs";

const TARGET = "https://glad-minnow-656.convex.cloud";
const DEPLOYMENT = "glad-minnow-656";
const SECRET = "scoped-secret";

function expected(id) {
  return { id, slug: `slug-${id}`, artist: "Artist", source_catalog_id: null, source_sha256: null, publication_state: null, duplicate_of_replication_id: null };
}

function suppressionUpdate(index) {
  return {
    expected_keeper: expected(`keeper-${String(index).padStart(3, "0")}`),
    expected_suppressed: expected(`suppressed-${String(index).padStart(3, "0")}`),
    reconciliation: {
      component_id: `component-${String(index).padStart(3, "0")}`,
      evidence_digest: createHash("sha256").update(`evidence-${index}`).digest("hex"),
      classification: "same-work-confirmed-prior-multi-method-review",
      keeper_policy: "original-collection-default",
      reddit_post_ids: [`post${index}`],
      source_references: [{ reference_id: `ref-${index}`, post_id: `post${index}`, post_url: `https://reddit.com/r/replications/${index}` }],
    },
  };
}

function fixture(root) {
  const updates = Array.from({ length: 331 }, (_, index) => suppressionUpdate(index + 1));
  const suppressionBatches = [];
  const rollbackBatches = [];
  const batchSizes = [...Array(16).fill(20), 10, 1];
  for (let start = 0, number = 1; number <= batchSizes.length; number += 1) {
    const selected = updates.slice(start, start + batchSizes[number - 1]);
    const payload = { operation_id: `suppress-${number}`, dry_run: true, updates: selected };
    const rollback = { operation_id: `rollback-${number}`, dry_run: true, updates: selected.map((update) => ({
      component_id: update.reconciliation.component_id,
      keeper_id: update.expected_keeper.id,
      suppressed_id: update.expected_suppressed.id,
      evidence_digest: update.reconciliation.evidence_digest,
    })) };
    suppressionBatches.push({ batchNumber: number, entryCount: selected.length, payloadSha256: digestValue(payload), payload });
    rollbackBatches.push({ batchNumber: number, entryCount: selected.length, payloadSha256: digestValue(rollback), payload: rollback });
    start += batchSizes[number - 1];
  }
  const components = Array.from({ length: 311 }, (_, index) => ({ graphComponentId: `graph-${index}` }));
  const core = {
    artifactType: "replication-index-expanded-duplicate-suppression-plan", schemaVersion: 1,
    campaignId: "test", mode: "local-zero-write-cas-plan", target: { deployment: "prod:glad-minnow-656", writesPerformed: 0 },
    policy: { batchCap: 20 }, inputs: {},
    counts: { confirmedDuplicatePairs: 367, duplicateComponents: 311, componentRows: 642, suppressedRows: 331, originalCollectionKeepers: 210, redditQualityExceptionKeepers: 101, multiEdgeComponents: 12, suppressionBatches: 18, rollbackBatches: 18, maximumBatchSize: 20, currentPublicWorks: 6986, projectedPublicWorks: 6655, replicationRowsDeleted: 0, r2ObjectsDeleted: 0, sourceMediaDeleted: 0, productionWrites: 0 },
    components, suppressionBatches, rollbackBatches,
  };
  const plan = { ...core, contentSha256: digestValue(core) };
  const text = `${JSON.stringify(plan, null, 2)}\n`;
  const planPath = path.join(root, "plan.json");
  writeFileSync(planPath, text);
  return { plan, planPath, fileSha256: digestValue(text) };
}

function options(f, extra = {}) {
  return { argv: ["--plan", f.planPath], env: { DATA_BACKEND: "postgres" }, expectedPlanPath: f.planPath, expectedPlanFileSha256: f.fileSha256, expectedPlanContentSha256: f.plan.contentSha256, clientFactory: vi.fn(), logger: { log() {} }, ...extra };
}

function liveArgs(...extra) {
  return ["--plan", extra.shift(), "--target", "postgresql://localhost/dosewiki", "--expected-deployment", "localhost/dosewiki", ...extra];
}

function resultFor(batch, kind = "suppression", dryRun = false) {
  return {
    operation_id: batch.payload.operation_id,
    dry_run: dryRun,
    ...(kind === "suppression" ? { suppressed: batch.entryCount, unchanged: 0 } : { restored: batch.entryCount, unchanged: 0 }),
    rows: batch.payload.updates.map(() => ({})),
  };
}

function activeRows(batch, rolledBack = false) {
  return batch.payload.updates.map((update) => ({
    _id: `recon-${update.reconciliation.component_id}`, _creationTime: 1, created_at: 1, updated_at: 2,
    component_id: update.reconciliation.component_id,
    keeper_replication_id: update.expected_keeper.id,
    suppressed_replication_id: update.expected_suppressed.id,
    evidence_digest: update.reconciliation.evidence_digest,
    classification: update.reconciliation.classification,
    keeper_policy: update.reconciliation.keeper_policy,
    reddit_post_ids: update.reconciliation.reddit_post_ids,
    source_references: update.reconciliation.source_references,
    state: rolledBack ? "rolled-back" : "active",
    operation_id: batch.payload.operation_id,
    ...(rolledBack ? { rollback_operation_id: `rollback-${batch.batchNumber}` } : {}),
  }));
}

describe("pinned duplicate suppression runner", () => {
  it("defaults to a zero-network local dry-run", async () => {
    const f = fixture(mkdtempSync(path.join(tmpdir(), "duplicate-runner-")));
    const runOptions = options(f);
    await expect(runPinnedDuplicateSuppression(runOptions)).resolves.toMatchObject({ mode: "local-dry-run", phase: "canary", batches: 1, suppressedRows: 331, networkCalls: 0 });
    expect(runOptions.clientFactory).not.toHaveBeenCalled();
  });

  it("runs a scoped live dry-run against the exact target without a ledger", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "duplicate-runner-"));
    const f = fixture(root);
    const mutation = vi.fn().mockResolvedValue(resultFor(f.plan.suppressionBatches[0], "suppression", true));
    const result = await runPinnedDuplicateSuppression(options(f, {
      argv: liveArgs(f.planPath, "--live-dry-run", "--phase", "canary"),
      env: { DATA_BACKEND: "postgres", DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE: SECRET }, clientFactory: () => ({ mutation }),
    }));
    expect(result).toMatchObject({ mode: "live-dry-run", batches: 1, networkCalls: 1 });
    expect(mutation.mock.calls[0][1]).toMatchObject({ apiKey: SECRET, dry_run: true });
    expect(readFileSync(f.planPath, "utf8")).not.toContain(SECRET);
  });

  it("rejects live operation without the scoped credential", async () => {
    const f = fixture(mkdtempSync(path.join(tmpdir(), "duplicate-runner-")));
    await expect(runPinnedDuplicateSuppression(options(f, {
      argv: liveArgs(f.planPath, "--live-dry-run"), env: { DATA_BACKEND: "postgres", DATA_ADMIN_KEY: "legacy-secret" },
    }))).rejects.toThrow(/scoped replicationMaintenance/i);
  });

  it("keeps remaining writes behind a verified canary", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "duplicate-runner-"));
    const f = fixture(root);
    const ledger = path.join(root, "ledger.json");
    const argv = liveArgs(f.planPath, "--ledger", ledger, "--write", "--phase", "remaining", "--confirm-write", "apply-pinned-duplicate-suppression");
    const mutation = vi.fn();
    await expect(runPinnedDuplicateSuppression(options(f, { argv, env: { DATA_BACKEND: "postgres", DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE: SECRET }, clientFactory: () => ({ mutation }) }))).rejects.toThrow(/verified canary/i);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("records an uncertain dispatched canary and never retries it", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "duplicate-runner-"));
    const f = fixture(root);
    const ledger = path.join(root, "ledger.json");
    const argv = liveArgs(f.planPath, "--ledger", ledger, "--write", "--phase", "canary", "--confirm-write", "apply-pinned-duplicate-suppression");
    const mutation = vi.fn().mockRejectedValue(new Error(`timeout ${SECRET}`));
    const runOptions = options(f, { argv, env: { DATA_BACKEND: "postgres", DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE: SECRET }, clientFactory: () => ({ mutation, query: vi.fn() }) });
    await expect(runPinnedDuplicateSuppression(runOptions)).rejects.toThrow(/uncertain.*without retry/i);
    const text = readFileSync(ledger, "utf8");
    expect(text).not.toContain(SECRET);
    expect(statSync(ledger).mode & 0o777).toBe(0o600);
    expect(JSON.parse(text).batches["suppression:01"].status).toBe("uncertain");
    await expect(runPinnedDuplicateSuppression(runOptions)).rejects.toThrow(/cannot auto-retry/i);
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  it("uses the pinned rollback payload and exact getByKeeper readback", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "duplicate-runner-"));
    const f = fixture(root);
    const ledger = path.join(root, "ledger.json");
    const suppression = f.plan.suppressionBatches[0];
    const rollback = f.plan.rollbackBatches[0];
    const byKeeper = new Map(activeRows(suppression).map((row) => [row.keeper_replication_id, row]));
    let keeperQueryCalls = 0;
    let rolledBack = false;
    const hotRows = new Map();
    for (const update of suppression.payload.updates) {
      hotRows.set(update.expected_keeper.id, { _id: update.expected_keeper.id, ...update.expected_keeper });
      hotRows.set(update.expected_suppressed.id, {
        _id: update.expected_suppressed.id,
        ...update.expected_suppressed,
        publication_state: "duplicate-suppressed",
        duplicate_of_replication_id: update.expected_keeper.id,
        duplicate_evidence_digest: update.reconciliation.evidence_digest,
      });
    }
    const client = {
      mutation: vi.fn()
        .mockImplementationOnce(async () => resultFor(suppression))
        .mockImplementationOnce(async () => {
          rolledBack = true;
          return resultFor(rollback, "rollback");
        }),
      query: vi.fn((_ref, args) => {
        if (args.id) {
          const row = { ...hotRows.get(args.id) };
          if (rolledBack && args.id.startsWith("suppressed-")) {
            delete row.publication_state;
            delete row.duplicate_of_replication_id;
            delete row.duplicate_evidence_digest;
          }
          return row;
        }
        keeperQueryCalls += 1;
        const row = byKeeper.get(args.keeper_replication_id);
        return [keeperQueryCalls <= suppression.entryCount
          ? row
          : { ...row, state: "rolled-back", rollback_operation_id: rollback.payload.operation_id }];
      }),
    };
    const common = ["--ledger", ledger, "--write", "--confirm-write", "apply-pinned-duplicate-suppression"];
    await runPinnedDuplicateSuppression(options(f, { argv: liveArgs(f.planPath, ...common, "--phase", "canary"), env: { DATA_BACKEND: "postgres", DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE: SECRET }, clientFactory: () => client }));
    const result = await runPinnedDuplicateSuppression(options(f, { argv: liveArgs(f.planPath, ...common, "--phase", "rollback", "--batch", "1"), env: { DATA_BACKEND: "postgres", DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE: SECRET }, clientFactory: () => client }));
    expect(result).toMatchObject({ mode: "write", phase: "rollback", verified: 1 });
    expect(client.mutation.mock.calls[1][1]).toEqual({ apiKey: SECRET, ...rollback.payload, dry_run: false });
    expect(JSON.parse(readFileSync(ledger, "utf8")).batches["rollback:01"].status).toBe("verified");
  });
});
