import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  digestValue,
  runLiveTaxonomyCasRepair,
} from "./apply-live-taxonomy-cas-repair-plan.mjs";

const TARGET = "https://glad-minnow-656.convex.cloud";

function expectedIdentity(index) {
  return {
    _id: `row${String(index).padStart(29, "0")}`,
    slug: `repair-${String(index).padStart(2, "0")}`,
    title: `Repair ${index}`,
    artist: "Reviewed Artist",
    type: "image",
    storage_id: `storage-${index}`,
    r2_key: `media/sha256/${String(index).padStart(2, "0")}/${"a".repeat(64)}.webp`,
  };
}

function expectedValue(index) {
  return {
    effect_slug: index % 2 === 0 ? "legacy-effect" : null,
    effect_tags: [],
    replication_status: "replication",
    taxonomy_record_key: `convex:row-${index}`,
    taxonomy_source_digest: "b".repeat(64),
    taxonomy_version: 2,
    taxonomy_updated_at: 123,
  };
}

function repair(index, blocked = false) {
  const identity = expectedIdentity(index);
  const value = expectedValue(index);
  const expected = {
    identity,
    value,
    liveRowSha256: digestValue({ ...identity, ...value }),
  };
  return {
    scope: "production-live-row",
    productionId: identity._id,
    status: blocked ? "blocked" : "resolved-plan-only",
    action: blocked ? "no-write" : "compare-and-set-effect-owner",
    expected,
    evidence: [{ kind: "review", fact: "Pinned review evidence." }],
    intended: blocked
      ? null
      : {
          value: {
            effect_slug: index % 2 === 0 ? "geometry" : "internal-hallucination",
            effect_tags: index % 2 === 0 ? [] : ["autonomous-entity"],
          },
          instruction: "Compare and set.",
        },
    rollback: { value, instruction: "Restore the pinned value." },
  };
}

function writePlan(root) {
  const liveRepairs = [
    ...Array.from({ length: 10 }, (_, index) => repair(index + 1)),
    ...Array.from({ length: 3 }, (_, index) => repair(index + 11, true)),
  ];
  const core = {
    schemaVersion: 2,
    artifactType: "replication-index-live-taxonomy-cas-repair-plan",
    campaignId: "replication-index-2026-08-30",
    generatedAt: "2026-08-31T07:31:45Z",
    liveSnapshotCapturedAt: "2026-08-31T05:29:36.962Z",
    status: "superseding-plan-only",
    target: {
      deployment: "glad-minnow-656",
      url: TARGET,
      liveReplicationQuery: "replications:getAll",
      liveEffectQuery: "subjectiveEffects:getAll",
    },
    counts: {
      liveOwningEffectGaps: 13,
      resolvedLiveRepairs: 10,
      blockedLiveRepairs: 3,
      resolvedLocalRepairs: 1,
      totalResolvedPlans: 11,
      totalBlocked: 3,
    },
    safety: {
      productionWrites: 0,
      convexMutations: 0,
      uploads: 0,
      deletions: 0,
      sourceMediaModifications: 0,
    },
    liveRepairs,
    localRepairs: [{ action: "omit-on-next-full-regeneration" }],
  };
  const plan = { ...core, planSha256: digestValue(core) };
  const planPath = path.join(root, "plan.json");
  const text = `${JSON.stringify(plan, null, 2)}\n`;
  writeFileSync(planPath, text);
  return {
    plan,
    planPath,
    fileSha256: createHash("sha256").update(text).digest("hex"),
  };
}

function options(fixture, overrides = {}) {
  return {
    argv: ["--plan", fixture.planPath],
    env: { DATA_BACKEND: "postgres" },
    expectedPlanPath: fixture.planPath,
    expectedPlanFileSha256: fixture.fileSha256,
    expectedDeclaredPlanSha256: fixture.plan.planSha256,
    clientFactory: vi.fn(),
    logger: { log() {}, error() {} },
    ...overrides,
  };
}

describe("live taxonomy CAS repair executor", () => {
  it("defaults to a deterministic, zero-network canary dry run", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "taxonomy-cas-"));
    const fixture = writePlan(root);
    const runOptions = options(fixture);

    const result = await runLiveTaxonomyCasRepair(runOptions);

    expect(result).toMatchObject({
      mode: "dry-run",
      phase: "canary",
      selected: 1,
      resolved: 10,
      blocked: 3,
      networkCalls: 0,
    });
    expect(result.selectedProductionIds).toEqual([
      fixture.plan.liveRepairs[0].productionId,
    ]);
    expect(runOptions.clientFactory).not.toHaveBeenCalled();
  });

  it("writes only the deterministic canary, reads it back, and records a nonsecret verified ledger", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "taxonomy-cas-"));
    const fixture = writePlan(root);
    const ledgerPath = path.join(root, "ledger.json");
    const canary = fixture.plan.liveRepairs[0];
    const before = { ...canary.expected.identity, ...canary.expected.value };
    const after = {
      ...before,
      effect_slug: canary.intended.value.effect_slug,
      effect_tags: canary.intended.value.effect_tags,
    };
    const query = vi.fn()
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);
    const mutation = vi.fn().mockResolvedValue({
      success: true,
      id: canary.productionId,
      slug: canary.expected.identity.slug,
      ...canary.intended.value,
    });
    const argv = [
      "--plan", fixture.planPath,
      "--ledger", ledgerPath,
      "--write",
      "--phase", "canary",
      "--target", "postgresql://localhost/dosewiki",
      "--expected-deployment", "localhost/dosewiki",
      "--confirm-write", "apply-live-taxonomy-cas-repair",
    ];

    const result = await runLiveTaxonomyCasRepair(options(fixture, {
      argv,
      env: { DATA_BACKEND: "postgres", DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE: "scoped-secret" },
      clientFactory: () => ({ query, mutation }),
    }));

    expect(result).toMatchObject({ mode: "write", phase: "canary", verified: 1 });
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(2);
    const mutationArgs = mutation.mock.calls[0][1];
    expect(mutationArgs).toMatchObject({
      apiKey: "scoped-secret",
      id: canary.productionId,
      expected: {
        identity: canary.expected.identity,
        value: canary.expected.value,
      },
      intended: canary.intended.value,
    });
    const ledgerText = readFileSync(ledgerPath, "utf8");
    expect(ledgerText).not.toContain("scoped-secret");
    expect(JSON.parse(ledgerText).items[canary.productionId].status).toBe("verified");
  });

  it("records a dispatched failure as uncertain, stops, and refuses an automatic retry", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "taxonomy-cas-"));
    const fixture = writePlan(root);
    const ledgerPath = path.join(root, "ledger.json");
    const canary = fixture.plan.liveRepairs[0];
    const before = { ...canary.expected.identity, ...canary.expected.value };
    const query = vi.fn().mockResolvedValue(before);
    const mutation = vi.fn().mockRejectedValue(new Error("timeout scoped-secret"));
    const argv = [
      "--plan", fixture.planPath,
      "--ledger", ledgerPath,
      "--write",
      "--phase", "canary",
      "--target", "postgresql://localhost/dosewiki",
      "--expected-deployment", "localhost/dosewiki",
      "--confirm-write", "apply-live-taxonomy-cas-repair",
    ];
    const runOptions = options(fixture, {
      argv,
      env: { DATA_BACKEND: "postgres", DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE: "scoped-secret" },
      clientFactory: () => ({ query, mutation }),
    });

    await expect(runLiveTaxonomyCasRepair(runOptions)).rejects.toThrow(/uncertain.*without retry/i);
    const ledgerText = readFileSync(ledgerPath, "utf8");
    expect(ledgerText).not.toContain("scoped-secret");
    expect(JSON.parse(ledgerText).items[canary.productionId].status).toBe("uncertain");

    await expect(runLiveTaxonomyCasRepair(runOptions)).rejects.toThrow(/cannot auto-retry/i);
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  it("keeps the nine-row remaining phase behind a separately verified canary", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "taxonomy-cas-"));
    const fixture = writePlan(root);
    const ledgerPath = path.join(root, "ledger.json");
    const mutation = vi.fn();
    const argv = [
      "--plan", fixture.planPath,
      "--ledger", ledgerPath,
      "--write",
      "--phase", "remaining",
      "--target", "postgresql://localhost/dosewiki",
      "--expected-deployment", "localhost/dosewiki",
      "--confirm-write", "apply-live-taxonomy-cas-repair",
    ];

    await expect(runLiveTaxonomyCasRepair(options(fixture, {
      argv,
      env: { DATA_BACKEND: "postgres", DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE: "scoped-secret" },
      clientFactory: () => ({ query: vi.fn(), mutation }),
    }))).rejects.toThrow(/separately verified canary/i);
    expect(mutation).not.toHaveBeenCalled();

    const dryRun = await runLiveTaxonomyCasRepair(options(fixture, {
      argv: ["--plan", fixture.planPath, "--phase", "remaining"],
    }));
    expect(dryRun).toMatchObject({ mode: "dry-run", phase: "remaining", selected: 9 });
  });

  it("requires the scoped credential and the exact full live-row precondition before dispatch", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "taxonomy-cas-"));
    const fixture = writePlan(root);
    const ledgerPath = path.join(root, "ledger.json");
    const argv = [
      "--plan", fixture.planPath,
      "--ledger", ledgerPath,
      "--write",
      "--phase", "canary",
      "--target", "postgresql://localhost/dosewiki",
      "--expected-deployment", "localhost/dosewiki",
      "--confirm-write", "apply-live-taxonomy-cas-repair",
    ];
    const clientFactory = vi.fn();
    await expect(runLiveTaxonomyCasRepair(options(fixture, {
      argv,
      env: { DATA_BACKEND: "postgres", DATA_ADMIN_KEY: "legacy-secret" },
      clientFactory,
    }))).rejects.toThrow(/scoped replicationMaintenance/i);
    expect(clientFactory).not.toHaveBeenCalled();

    const canary = fixture.plan.liveRepairs[0];
    const drifted = {
      ...canary.expected.identity,
      ...canary.expected.value,
      title: "Changed after planning",
    };
    const mutation = vi.fn();
    await expect(runLiveTaxonomyCasRepair(options(fixture, {
      argv,
      env: { DATA_BACKEND: "postgres", DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE: "scoped-secret" },
      clientFactory: () => ({ query: vi.fn().mockResolvedValue(drifted), mutation }),
    }))).rejects.toThrow(/full live row SHA-256 drifted/i);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("rejects a stale file pin and any plan that makes a blocked row writable", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "taxonomy-cas-"));
    const fixture = writePlan(root);
    await expect(runLiveTaxonomyCasRepair(options(fixture, {
      expectedPlanFileSha256: "0".repeat(64),
    }))).rejects.toThrow(/file SHA-256 mismatch/i);

    const changed = structuredClone(fixture.plan);
    const blocked = changed.liveRepairs.find((repair) => repair.status === "blocked");
    blocked.action = "compare-and-set-effect-owner";
    blocked.intended = {
      value: { effect_slug: "geometry", effect_tags: [] },
      instruction: "Unsafe",
    };
    delete changed.planSha256;
    changed.planSha256 = digestValue(changed);
    const changedText = `${JSON.stringify(changed, null, 2)}\n`;
    writeFileSync(fixture.planPath, changedText);
    await expect(runLiveTaxonomyCasRepair(options(fixture, {
      expectedPlanFileSha256: createHash("sha256").update(changedText).digest("hex"),
      expectedDeclaredPlanSha256: changed.planSha256,
    }))).rejects.toThrow(/blocked row is writable/i);
  });
});
