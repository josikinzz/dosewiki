import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DECLARED_PLAN_SHA256, DEDUPE_CONTENT_SHA256, DEDUPE_PLAN_FILE_SHA256, EXACT_TARGET,
  OPERATION, PLAN_FILE_SHA256, deriveBatches, rollbackFor, runAttributionRollout,
  validateDedupeCompletion, validatePinnedPlan,
} from "./run-attribution-repair-rollout.mjs";

const PLAN = "/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Index Campaign 2026-08-30/attribution-repair-plan-2026-08-31.json";
const baseArgs = (ledger, extra = []) => ["--plan", PLAN, "--ledger", ledger, "--target-url", EXACT_TARGET, "--expected-deployment", "glad-minnow-656", "--expected-plan-file-sha256", PLAN_FILE_SHA256, "--expected-plan-sha256", DECLARED_PLAN_SHA256, ...extra];
const completion = () => ({ status: "complete", target: EXACT_TARGET, deployment: "prod:glad-minnow-656", planFileSha256: DEDUPE_PLAN_FILE_SHA256, contentSha256: DEDUPE_CONTENT_SHA256 });

// The 12.5 MB plan is retained in the campaign evidence library rather than
// duplicated into the website repository. This exact-plan integration suite
// runs when the SHA-pinned artifact is mounted and skips on generic CI hosts.
describe.skipIf(!existsSync(PLAN))("pinned attribution rollout", () => {
  it("validates exact plan coverage and deterministic bounded rollback batches", () => {
    const bytes = readFileSync(PLAN); const plan = validatePinnedPlan(JSON.parse(bytes), bytes); const batches = deriveBatches(plan);
    expect(batches).toHaveLength(102); expect(batches[0].updates).toHaveLength(50); expect(batches.at(-1).updates).toHaveLength(47);
    expect(batches.every((b) => b.updates.length <= 50)).toBe(true);
    expect(rollbackFor(batches[0].updates[0], batches[0].operationId).expected_attribution_operation_id).toBe(batches[0].operationId);
  });
  it("rejects plan drift and incomplete dedupe evidence", () => {
    const bytes = readFileSync(PLAN); const changed = Buffer.concat([bytes, Buffer.from(" ")]);
    expect(() => validatePinnedPlan(JSON.parse(bytes), changed)).toThrow(/file SHA/i);
    expect(() => validateDedupeCompletion({ ...completion(), status: "pending" })).toThrow(/not completely/i);
  });
  it("defaults to a zero-network local dry run", async () => {
    const result = await runAttributionRollout({ argv: ["--plan", PLAN], env: {}, clientFactory: () => { throw new Error("network"); }, logger: { log() {} } });
    expect(result).toMatchObject({ mode: "local-dry-run", networkCalls: 0, batches: 1 });
  });
  it("live dry-run invokes dry_run without creating a ledger", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "attr-run-")); const ledger = path.join(root, "ledger.json");
    const mutation = vi.fn().mockResolvedValue({ updated: 50, unchanged: 0 });
    const result = await runAttributionRollout({ argv: baseArgs(ledger, ["--live-dry-run"]), env: { CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE: "secret" }, clientFactory: () => ({ mutation }), logger: { log() {} } });
    expect(result.mode).toBe("live-dry-run"); expect(mutation.mock.calls[0][1]).toMatchObject({ dry_run: true });
    expect(() => statSync(ledger)).toThrow();
  });
  it("requires the scoped credential for any live call", async () => {
    await expect(runAttributionRollout({ argv: baseArgs("/tmp/no-ledger", ["--live-dry-run"]), env: {}, logger: { log() {} } })).rejects.toThrow(/REPLICATION_MAINTENANCE/);
  });
  it("enforces dedupe and canary gates", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "attr-run-")); const ledger = path.join(root, "ledger.json");
    await expect(runAttributionRollout({ argv: baseArgs(ledger, ["--write", "--phase", "remaining", "--confirm-write", OPERATION]), env: { CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE: "secret" }, logger: { log() {} } })).rejects.toThrow(/dedupe-completion/);
    const evidence = path.join(root, "dedupe.json"); writeFileSync(evidence, JSON.stringify(completion()));
    await expect(runAttributionRollout({ argv: baseArgs(ledger, ["--write", "--phase", "remaining", "--confirm-write", OPERATION, "--dedupe-completion-evidence", evidence]), env: { CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE: "secret" }, logger: { log() {} } })).rejects.toThrow(/canary/i);
  });
  it("marks dispatch errors uncertain, writes a 0600 secret-free ledger, and refuses retry", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "attr-run-")); const ledger = path.join(root, "ledger.json"); const evidence = path.join(root, "dedupe.json"); writeFileSync(evidence, JSON.stringify(completion()));
    const plan = JSON.parse(readFileSync(PLAN)); const batch = deriveBatches(plan)[0]; const first = batch.updates[0];
    const hot = { id: first.expected.id, slug: first.expected.slug, source_sha256: first.expected.source_sha256, source_catalog_id: first.expected.source_catalog_id, artist: first.expected.artist, artist_url: first.expected.artist_url, credit_line: first.expected.credit_line, rightsholder: first.expected.rightsholder, attribution: null };
    const before = batch.updates.map((update, index) => index === 0 ? hot : ({
      id: update.expected.id,
      slug: update.expected.slug,
      source_sha256: update.expected.source_sha256,
      source_catalog_id: update.expected.source_catalog_id,
      artist: update.expected.artist,
      artist_url: update.expected.artist_url,
      credit_line: update.expected.credit_line,
      rightsholder: update.expected.rightsholder,
      attribution: null,
    }));
    const client = { query: vi.fn().mockResolvedValue(before), mutation: vi.fn().mockRejectedValue(new Error("timeout")) };
    const argv = baseArgs(ledger, ["--write", "--phase", "canary", "--confirm-write", OPERATION, "--dedupe-completion-evidence", evidence]);
    await expect(runAttributionRollout({ argv, env: { CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE: "secret" }, clientFactory: () => client, logger: { log() {} } })).rejects.toThrow(/uncertain/i);
    expect(statSync(ledger).mode & 0o777).toBe(0o600); expect(readFileSync(ledger, "utf8")).not.toContain("secret");
    await expect(runAttributionRollout({ argv, env: { CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE: "secret" }, clientFactory: () => client, logger: { log() {} } })).rejects.toThrow(/uncertain/i);
  });
  it("builds the exact rollback contract", () => {
    const plan = JSON.parse(readFileSync(PLAN)); const batch = deriveBatches(plan)[0]; const row = rollbackFor(batch.updates[0], batch.operationId);
    expect(Object.keys(row).sort()).toEqual(["expected_attribution_operation_id", "expected_current", "rollback_credit", "source_digest"]);
    expect(row.rollback_credit).toEqual({ artist: batch.updates[0].expected.artist, artist_url: batch.updates[0].expected.artist_url, credit_line: batch.updates[0].expected.credit_line, rightsholder: batch.updates[0].expected.rightsholder });
  });
});
