import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { run } from "./apply-approved-profile-merges.mjs";
import { APPROVED_MERGES, buildRollbackManifest, loadLedger, mergeOperationId, rollbackOperationId } from "./approved-profile-merge-executor-lib.mjs";

const targetFlags = ["--target=postgresql://localhost/dosewiki", "--expected-deployment=localhost/dosewiki", "--actor-email=test@example.com"];
const files = () => { const dir = mkdtempSync(join(tmpdir(), "profile-merge-executor-")); return { ledger: join(dir, "ledger.jsonl"), plan: join(dir, "plan.json"), rollback: join(dir, "rollback.json") }; };
const paths = (set) => [`--ledger=${set.ledger}`, `--plan-out=${set.plan}`, `--rollback-out=${set.rollback}`];
const makeAdapters = () => {
  const operations = new Map(); const calls = []; const events = [];
  return {
    env: { DATA_BACKEND: "postgres" }, calls, events, apiKey: "not-a-real-secret",
    query: async (_reference, args) => {
      if (args.operation_id) { events.push(`receipt:${args.operation_id}`); return operations.get(args.operation_id) ?? null; }
      events.push(`preview:${args.input.target_key}`);
      const suffix = args.input.target_key === "LOKA" ? "a" : "b";
      return { state_digest: suffix.repeat(64), source_profile_id: args.input.source_profile_id, target_profile_id: args.input.target_profile_id, attribution_count: 1, binding_count: 1, report_count: 0 };
    },
    mutate: async (_reference, args) => {
      calls.push(args);
      if (args.rollback_of) {
        events.push(`rollback:${args.rollback_of}:${args.dry_run}`);
        const receipt = operations.get(args.rollback_of);
        if (!args.dry_run) receipt.operation.status = "rolled-back";
        return { operation_id: args.operation_id, payload_digest: receipt.operation.payload_digest, state_digest: "c".repeat(64), item_count: receipt.operation.item_count, idempotent_replay: false, dry_run: args.dry_run };
      }
      events.push(`apply:${args.input.target_key}:${args.dry_run}`);
      const itemCount = args.input.target_key === "LOKA" ? 4 : 5; const payload = args.input.target_key === "LOKA" ? "d".repeat(64) : "e".repeat(64);
      if (!args.dry_run) operations.set(args.operation_id, { operation: { operation_id: args.operation_id, payload_digest: payload, status: "applied", item_count: itemCount }, live_matches: true, checked_items: itemCount });
      return { operation_id: args.operation_id, payload_digest: payload, state_digest: "f".repeat(64), item_count: itemCount, idempotent_replay: false, dry_run: args.dry_run };
    },
  };
};

test("stable operation and rollback IDs are deterministic", () => {
  assert.equal(mergeOperationId(APPROVED_MERGES[0]), mergeOperationId(structuredClone(APPROVED_MERGES[0])));
  assert.match(mergeOperationId(APPROVED_MERGES[0]), /^contributor-profile-merge:v1:[a-f0-9]{32}$/);
  assert.match(rollbackOperationId(mergeOperationId(APPROVED_MERGES[0])), /^contributor-profile-merge-rollback:v1:[a-f0-9]{32}$/);
});

test("dry run touches no ledger and performs only dry-run mutations", async () => {
  const set = files(); const adapters = makeAdapters();
  const result = await run([...targetFlags, ...paths(set)], adapters);
  assert.equal(result.mode, "dry-run");
  assert.equal(loadLedger(set.ledger).length, 0);
  assert.equal(adapters.calls.length, 2);
  assert.ok(adapters.calls.every((call) => call.dry_run === true));
  assert.equal(JSON.parse(readFileSync(set.plan)).merges.length, 2);
});

test("write applies LOKA, exactly reads it twice, then applies PHOSFORM and journals append-only", async () => {
  const set = files(); const adapters = makeAdapters();
  const result = await run([...targetFlags, ...paths(set), "--write", "--confirm-write=apply-approved-contributor-profile-merges"], adapters);
  assert.equal(result.mode, "write");
  assert.deepEqual(adapters.calls.map((call) => [call.input?.target_key ?? call.rollback_of, call.dry_run]), [["LOKA", true], ["LOKA", false], ["PHOSFORM", true], ["PHOSFORM", false]]);
  const lokaOperation = mergeOperationId(APPROVED_MERGES[0]);
  const phosformPreview = adapters.events.indexOf("preview:PHOSFORM");
  assert.equal(adapters.events.filter((event) => event === `receipt:${lokaOperation}`).length, 3);
  assert.ok(adapters.events.lastIndexOf(`receipt:${lokaOperation}`) < phosformPreview);
  const ledger = loadLedger(set.ledger);
  assert.deepEqual(ledger.filter((event) => event.event === "profile-merge-readback-verified").map((event) => event.target_key), ["LOKA", "PHOSFORM"]);
  assert.equal(buildRollbackManifest(ledger).operations[0].target_key, "PHOSFORM");
  assert.ok(!readFileSync(set.ledger, "utf8").includes("not-a-real-secret"));
});

test("PHOSFORM-only write fails closed without a verified LOKA canary", async () => {
  const set = files();
  await assert.rejects(run([...targetFlags, ...paths(set), "--only=phosform", "--write", "--confirm-write=apply-approved-contributor-profile-merges"], makeAdapters()), /gated on an exact, ledgered LOKA/);
});

test("resume verifies server receipts and makes no repeat mutation", async () => {
  const set = files(); const adapters = makeAdapters();
  await run([...targetFlags, ...paths(set), "--write", "--confirm-write=apply-approved-contributor-profile-merges"], adapters);
  const callCount = adapters.calls.length;
  const resumed = await run([...targetFlags, ...paths(set), "--write", "--confirm-write=apply-approved-contributor-profile-merges"], adapters);
  assert.equal(adapters.calls.length, callCount);
  assert.ok(resumed.merges.every((item) => item.status === "already-applied-readback-verified"));
});

test("rollback is dry-run by default and write uses reverse-order manifest", async () => {
  const set = files(); const adapters = makeAdapters();
  await run([...targetFlags, ...paths(set), "--write", "--confirm-write=apply-approved-contributor-profile-merges"], adapters);
  const before = adapters.calls.length;
  const dry = await run([...targetFlags, ...paths(set), "--rollback"], adapters);
  assert.equal(dry.mode, "rollback-dry-run");
  assert.ok(adapters.calls.slice(before).every((call) => call.dry_run));
  const manifest = JSON.parse(readFileSync(set.rollback));
  assert.deepEqual(manifest.operations.map((item) => item.target_key), ["PHOSFORM", "LOKA"]);
});

test("incomplete or mismatched production authorization fails before network access", async () => {
  const set = files();
  const adapters = makeAdapters();
  await assert.rejects(run(["--actor-email=test@example.com", ...paths(set)], adapters), /requires --target/);
  await assert.rejects(run([...targetFlags, ...paths(set), "--write"], adapters), /requires --confirm-write/);
  await assert.rejects(run(["--target=postgresql://localhost/other", "--expected-deployment=localhost/dosewiki", "--actor-email=test@example.com", ...paths(set)], adapters), /matching --expected-deployment/);
  assert.deepEqual(adapters.events, []);
  assert.deepEqual(adapters.calls, []);
});
