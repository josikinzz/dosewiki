import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DEDUPE_CONTENT_SHA256, DEDUPE_PLAN_FILE_SHA256, EXACT_TARGET, OPERATION, PINNED_PLAN,
  deriveBatches, rollbackFor, runAttributionRollout, validateDedupeCompletion, validatePinnedPlan,
} from "./run-attribution-repair-rollout.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const SECRET = "scoped-secret";
const env = { DATA_BACKEND: "postgres", DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE: SECRET };
const logger = { log() {} };

// The runner pins the exact campaign population (5,097 eligible credit updates
// plus 798 no-write exceptions reconciling to 5,895 Reddit rows across 7,013
// production rows). The synthesized plan reproduces that population with
// self-consistent identities so every gate runs without the evidence library.
function synthesizePlan() {
  const updates = Array.from({ length: 5097 }, (_, index) => {
    const number = String(index + 1).padStart(5, "0");
    const sourceSha256 = sha256(`source-${number}`);
    const expected = {
      id: `rep-${number}`,
      slug: `replication-${number}`,
      source_sha256: sourceSha256,
      source_catalog_id: `reddit-sha256:${sourceSha256}`,
      artist: `u/poster${number}`,
      artist_url: `https://reddit.com/u/poster${number}`,
      credit_line: null,
      rightsholder: null,
    };
    return {
      expected,
      attribution: { source_digest: sha256(`evidence-${number}`), review_required: false, proposed_artist: `Artist ${number}` },
      intended_credit: { artist: `Artist ${number}`, artist_url: `https://artist.example/${number}`, credit_line: `Artist ${number}`, rightsholder: `Artist ${number}` },
      rollback: { attribution_record_expected_absent: true, artist: expected.artist, artist_url: expected.artist_url, credit_line: null, rightsholder: null },
    };
  });
  const noWriteExceptions = Array.from({ length: 798 }, (_, index) => {
    const number = String(index + 1).padStart(5, "0");
    return { id: `held-${number}`, slug: `held-replication-${number}`, sourceSha256: sha256(`held-${number}`), reason: "review-required" };
  });
  const plan = {
    schemaVersion: 1,
    artifactType: "replication-index-attribution-repair-plan",
    planSha256: sha256("synthetic-attribution-repair-plan"),
    target: { deployment: "prod:glad-minnow-656", writesPerformed: 0 },
    counts: { eligibleCreditUpdates: 5097, productionRowsPinned: 7013, redditRowsPinned: 5895, productionWrites: 0 },
    updates,
    noWriteExceptions,
  };
  const text = `${JSON.stringify(plan)}\n`;
  const root = mkdtempSync(path.join(tmpdir(), "attr-plan-"));
  const planPath = path.join(root, "attribution-repair-plan.json");
  writeFileSync(planPath, text);
  return { plan, planPath, bytes: Buffer.from(text), pins: { fileSha256: sha256(text), planSha256: plan.planSha256 } };
}

const fixture = synthesizePlan();
const PLAN = fixture.planPath;
const pins = fixture.pins;
const baseArgs = (ledger, extra = []) => ["--plan", PLAN, "--ledger", ledger, "--target", "postgresql://localhost/dosewiki", "--expected-deployment", "localhost/dosewiki", "--expected-plan-file-sha256", pins.fileSha256, "--expected-plan-sha256", pins.planSha256, ...extra];
const completion = () => ({ status: "complete", target: EXACT_TARGET, deployment: "prod:glad-minnow-656", planFileSha256: DEDUPE_PLAN_FILE_SHA256, contentSha256: DEDUPE_CONTENT_SHA256 });
const run = (options) => runAttributionRollout({ env, logger, pins, ...options });
const workspace = () => {
  const root = mkdtempSync(path.join(tmpdir(), "attr-run-"));
  const evidence = path.join(root, "dedupe.json");
  writeFileSync(evidence, JSON.stringify(completion()));
  return { ledger: path.join(root, "ledger.json"), evidence };
};
const hotRow = (update, credit = update.expected, attribution = null) => ({
  id: update.expected.id,
  slug: update.expected.slug,
  source_sha256: update.expected.source_sha256,
  source_catalog_id: update.expected.source_catalog_id,
  artist: credit.artist,
  artist_url: credit.artist_url,
  credit_line: credit.credit_line,
  rightsholder: credit.rightsholder,
  attribution,
});
const coldRecord = (update, operationId) => ({
  replication_id: update.expected.id,
  source_catalog_id: update.expected.source_catalog_id,
  source_sha256: update.expected.source_sha256,
  source_digest: update.attribution.source_digest,
  operation_id: operationId,
});

describe("pinned attribution rollout", () => {
  it("validates exact plan coverage and deterministic bounded rollback batches", () => {
    const plan = validatePinnedPlan(JSON.parse(fixture.bytes), fixture.bytes, pins);
    const batches = deriveBatches(plan);
    expect(batches).toHaveLength(102);
    expect(batches[0].updates).toHaveLength(50);
    expect(batches.at(-1).updates).toHaveLength(47);
    expect(batches.every((batch) => batch.updates.length <= 50)).toBe(true);
    expect(batches[0].phase).toBe("canary");
    expect(batches.slice(1).every((batch) => batch.phase === "remaining")).toBe(true);
    expect(batches.flatMap((batch) => batch.updates.map((update) => update.expected.id))).toEqual(plan.updates.map((update) => update.expected.id));
    expect(rollbackFor(batches[0].updates[0], batches[0].operationId).expected_attribution_operation_id).toBe(batches[0].operationId);
  });

  it("rejects plan drift and incomplete dedupe evidence", () => {
    const parsed = JSON.parse(fixture.bytes);
    expect(() => validatePinnedPlan(parsed, Buffer.concat([fixture.bytes, Buffer.from(" ")]), pins)).toThrow(/file SHA/i);
    expect(() => validatePinnedPlan({ ...parsed, planSha256: "0".repeat(64) }, fixture.bytes, pins)).toThrow(/planSha256 drifted/);
    expect(() => validatePinnedPlan(parsed, fixture.bytes, PINNED_PLAN)).toThrow(/file SHA/i);
    const duplicated = structuredClone(parsed);
    duplicated.updates[1].expected.source_sha256 = duplicated.updates[0].expected.source_sha256;
    duplicated.updates[1].expected.source_catalog_id = duplicated.updates[0].expected.source_catalog_id;
    const duplicatedBytes = Buffer.from(`${JSON.stringify(duplicated)}\n`);
    expect(() => validatePinnedPlan(duplicated, duplicatedBytes, { ...pins, fileSha256: sha256(duplicatedBytes) })).toThrow(/Duplicate eligible source SHA/);
    const inexact = structuredClone(parsed);
    inexact.updates[0].rollback.artist = "someone else";
    const inexactBytes = Buffer.from(`${JSON.stringify(inexact)}\n`);
    expect(() => validatePinnedPlan(inexact, inexactBytes, { ...pins, fileSha256: sha256(inexactBytes) })).toThrow(/rollback artist is not exact/);
    expect(() => validateDedupeCompletion({ ...completion(), status: "pending" })).toThrow(/not completely/i);
    expect(() => validateDedupeCompletion({ ...completion(), planFileSha256: "0".repeat(64) })).toThrow(/plan file digest drifted/i);
  });

  it("defaults to a zero-network local dry run", async () => {
    const result = await run({ argv: ["--plan", PLAN], env: { DATA_BACKEND: "postgres" }, clientFactory: () => { throw new Error("network"); } });
    expect(result).toMatchObject({ mode: "local-dry-run", networkCalls: 0, batches: 1 });
  });

  it("live dry-run invokes dry_run without creating a ledger", async () => {
    const { ledger } = workspace();
    const mutation = vi.fn().mockResolvedValue({ updated: 50, unchanged: 0 });
    const result = await run({ argv: baseArgs(ledger, ["--live-dry-run"]), clientFactory: () => ({ mutation }) });
    expect(result.mode).toBe("live-dry-run");
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation.mock.calls[0][1]).toMatchObject({ dry_run: true, apiKey: SECRET });
    expect(mutation.mock.calls[0][1].updates.every((update) => update.rollback === undefined)).toBe(true);
    expect(() => statSync(ledger)).toThrow();
  });

  it("requires the scoped credential and exact plan confirmation for any live call", async () => {
    const { ledger } = workspace();
    await expect(run({ argv: baseArgs(ledger, ["--live-dry-run"]), env: { DATA_BACKEND: "postgres" } })).rejects.toThrow(/REPLICATION_MAINTENANCE/);
    await expect(run({ argv: baseArgs(ledger, ["--live-dry-run"]), env: { DATA_BACKEND: "postgres", DATA_ADMIN_KEY: "legacy" } })).rejects.toThrow(/REPLICATION_MAINTENANCE/);
    const wrongPin = baseArgs(ledger, ["--live-dry-run"]).map((arg) => (arg === pins.fileSha256 ? "0".repeat(64) : arg));
    await expect(run({ argv: wrongPin, clientFactory: () => { throw new Error("network"); } })).rejects.toThrow(/Exact attribution plan confirmation/);
  });

  it("enforces dedupe and canary gates", async () => {
    const { ledger, evidence } = workspace();
    const clientFactory = vi.fn(() => { throw new Error("client must not be constructed before local gates"); });
    await expect(run({ argv: baseArgs(ledger, ["--write", "--phase", "remaining", "--confirm-write", OPERATION]), clientFactory })).rejects.toThrow(/dedupe-completion/);
    await expect(run({ argv: baseArgs(ledger, ["--write", "--phase", "remaining", "--confirm-write", OPERATION, "--dedupe-completion-evidence", evidence]), clientFactory })).rejects.toThrow(/canary/i);
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("rejects absent, mismatched, and retired live targets before constructing a client", async () => {
    const { ledger } = workspace();
    const clientFactory = vi.fn(() => { throw new Error("network"); });
    const argv = baseArgs(ledger, ["--live-dry-run"]);
    const targetIndex = argv.indexOf("--target");
    const withoutTarget = argv.filter((_, index) => index !== targetIndex && index !== targetIndex + 1);
    const mismatched = argv.map((arg) => arg === "localhost/dosewiki" ? "localhost/other" : arg);
    const retired = argv.map((arg) => arg === "postgresql://localhost/dosewiki" ? EXACT_TARGET : arg);
    for (const args of [withoutTarget, mismatched, retired]) {
      await expect(run({ argv: args, clientFactory })).rejects.toThrow();
    }
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("applies the canary only after exact pre-write read-back and verifies hot and cold post-write state", async () => {
    const { ledger, evidence } = workspace();
    const batch = deriveBatches(fixture.plan)[0];
    const calls = [];
    const client = {
      query: vi.fn(async (_fn, args) => {
        calls.push("query");
        expect(args.replication_ids).toEqual(batch.updates.map((update) => update.expected.id));
        const written = calls.includes("mutation");
        return batch.updates.map((update) => (written
          ? hotRow(update, update.intended_credit, coldRecord(update, batch.operationId))
          : hotRow(update)));
      }),
      mutation: vi.fn(async (_fn, args) => {
        calls.push("mutation");
        expect(args).toMatchObject({ operation_id: batch.operationId, dry_run: false, apiKey: SECRET });
        expect(args.updates).toHaveLength(50);
        return { updated: 50, unchanged: 0 };
      }),
    };
    const argv = baseArgs(ledger, ["--write", "--phase", "canary", "--confirm-write", OPERATION, "--dedupe-completion-evidence", evidence]);
    const result = await run({ argv, clientFactory: () => client });
    expect(result).toMatchObject({ mode: "write", phase: "canary", batches: 1 });
    expect(calls).toEqual(["query", "mutation", "query"]);
    const persisted = JSON.parse(readFileSync(ledger, "utf8"));
    expect(persisted.batches[batch.operationId]).toMatchObject({ phase: "canary", status: "verified", attempts: 1, error: null });
    expect(persisted.plan).toEqual({ path: PLAN, fileSha256: pins.fileSha256, planSha256: pins.planSha256 });

    await run({ argv, clientFactory: () => client });
    expect(client.mutation).toHaveBeenCalledTimes(1);
  });

  it("refuses to write when a row already carries attribution before apply", async () => {
    const { ledger, evidence } = workspace();
    const batch = deriveBatches(fixture.plan)[0];
    const before = batch.updates.map((update, index) => hotRow(update, update.expected, index === 0 ? coldRecord(update, "someone-else") : null));
    const client = { query: vi.fn().mockResolvedValue(before), mutation: vi.fn() };
    const argv = baseArgs(ledger, ["--write", "--phase", "canary", "--confirm-write", OPERATION, "--dedupe-completion-evidence", evidence]);
    await expect(run({ argv, clientFactory: () => client })).rejects.toThrow(/attribution already exists before apply/);
    expect(client.mutation).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(ledger, "utf8")).batches[batch.operationId].status).toBe("uncertain");
  });

  it("marks dispatch errors uncertain, writes a 0600 secret-free ledger, and refuses retry", async () => {
    const { ledger, evidence } = workspace();
    const batch = deriveBatches(fixture.plan)[0];
    const before = batch.updates.map((update) => hotRow(update));
    const client = { query: vi.fn().mockResolvedValue(before), mutation: vi.fn().mockRejectedValue(new Error("timeout")) };
    const argv = baseArgs(ledger, ["--write", "--phase", "canary", "--confirm-write", OPERATION, "--dedupe-completion-evidence", evidence]);
    await expect(run({ argv, clientFactory: () => client })).rejects.toThrow(/uncertain/i);
    expect(statSync(ledger).mode & 0o777).toBe(0o600);
    expect(readFileSync(ledger, "utf8")).not.toContain(SECRET);
    expect(JSON.parse(readFileSync(ledger, "utf8")).batches[batch.operationId]).toMatchObject({ status: "uncertain", attempts: 1, error: { message: "timeout" } });
    await expect(run({ argv, clientFactory: () => client })).rejects.toThrow(/uncertain/i);
    expect(client.mutation).toHaveBeenCalledTimes(1);
  });

  it("refuses a ledger whose plan lineage drifted from the pinned plan", async () => {
    const { ledger, evidence } = workspace();
    const stale = { schemaVersion: 1, artifactType: "replication-index-attribution-repair-ledger", operation: OPERATION, target: EXACT_TARGET, deployment: "prod:glad-minnow-656", plan: { path: PLAN, fileSha256: "0".repeat(64), planSha256: pins.planSha256 }, batches: {} };
    writeFileSync(ledger, JSON.stringify(stale));
    const client = { query: vi.fn(), mutation: vi.fn() };
    const argv = baseArgs(ledger, ["--write", "--phase", "canary", "--confirm-write", OPERATION, "--dedupe-completion-evidence", evidence]);
    await expect(run({ argv, clientFactory: () => client })).rejects.toThrow(/plan lineage drifted/);
    expect(client.query).not.toHaveBeenCalled();
    expect(client.mutation).not.toHaveBeenCalled();
  });

  it("builds the exact rollback contract", () => {
    const batch = deriveBatches(fixture.plan)[0];
    const row = rollbackFor(batch.updates[0], batch.operationId);
    expect(Object.keys(row).sort()).toEqual(["expected_attribution_operation_id", "expected_current", "rollback_credit", "source_digest"]);
    expect(row.rollback_credit).toEqual({ artist: batch.updates[0].expected.artist, artist_url: batch.updates[0].expected.artist_url, credit_line: batch.updates[0].expected.credit_line, rightsholder: batch.updates[0].expected.rightsholder });
    expect(row.expected_current).toEqual({ ...batch.updates[0].expected, ...batch.updates[0].intended_credit });
    expect(row.source_digest).toBe(batch.updates[0].attribution.source_digest);
  });
});
