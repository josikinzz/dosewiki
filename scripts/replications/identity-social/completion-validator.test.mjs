import test from "node:test";
import assert from "node:assert/strict";
import { activeLedgerOperations, digest, sealReport, validateCompletionEvidence } from "./completion-validator-lib.mjs";

function fixture() {
  const profileEntries = Array.from({ length: 48 }, (_, index) => ({ kind: "profile-binding", item_operation_id: `profile-${index}`, decision: index < 21 ? "create" : index < 26 ? "bind" : "unresolved" }));
  const attributionEntries = Array.from({ length: 215 }, (_, index) => ({ kind: "attribution", item_operation_id: `attribution-${index}` }));
  const aliasEntries = Array.from({ length: 5 }, (_, index) => ({ kind: "alias", item_operation_id: `alias-${index}` }));
  const avatarEntries = Array.from({ length: 7 }, (_, index) => ({ kind: "avatar", item_operation_id: `avatar-${index}` }));
  const verificationEntries = Array.from({ length: 2_079 }, (_, index) => ({ kind: "verification", item_operation_id: `verification-${index}`, ...(index === 0 ? { satisfied_item_operation_ids: ["verification-source-a", "verification-source-b"] } : {}) }));
  const socialEntries = Array.from({ length: 9_172 }, (_, index) => ({ kind: "social-asset", item_operation_id: `social-${index}`, value: { media_digest: String(Math.min(index, 9_170)).padStart(64, "0") } }));
  const entries = [...profileEntries, ...attributionEntries, ...aliasEntries, ...avatarEntries, ...verificationEntries, ...socialEntries];
  const profileOperations = Array.from({ length: 48 }, (_, index) => ({ kind: "profile-binding", after: { verificationDependency: { verificationOperationId: `embedded-verification-${index}` } } }));
  const attributionOperations = Array.from({ length: 215 }, (_, index) => ({ kind: "creator-attribution", action: index < 6 ? "set-proven-creator-with-verified-chronology" : "preserve-poster-as-creator-no-write" }));
  const aliasOperations = Array.from({ length: 5 }, () => ({ kind: "profile-alias", action: "blocked-merge-required-collision" }));
  const projection = { target: { convexDeployment: "glad-minnow-656" }, projectionSha256: "a".repeat(64), counts: { profileBindingDecisions: 48, profileCreates: 21, profileBinds: 5, profileBindingNoWrites: 22, creatorAttributionDecisions: 215, creatorChanges: 6, creatorPreservations: 209, aliasDecisions: 5, approvedAliasAdds: 0, avatarProposals: 7, verificationDecisions: 2_127, socialAssets: 9_172 }, operations: [...profileOperations, ...attributionOperations, ...aliasOperations] };
  const plan = { entries, noWrites: [], receipt_sidecar_digest: "b".repeat(64) };
  const ledger = []; const receipts = [];
  for (const kind of ["profile-binding", "attribution", "alias", "avatar", "verification", "social-asset"]) {
    const kindEntries = entries.filter((entry) => entry.kind === kind);
    for (let offset = 0; offset < kindEntries.length; offset += 50) {
      const batchEntries = kindEntries.slice(offset, offset + 50); const operation_id = `batch-${kind}-${offset}`;
      const items = batchEntries.map((entry) => ({ item_operation_id: entry.item_operation_id, kind, changed: entry.decision !== "unresolved", live_matches: true, expected_after_digest: "c".repeat(64), current_digest: "c".repeat(64), satisfied_item_operation_ids: entry.satisfied_item_operation_ids ?? [] }));
      const payload_digest = digest(kind === "profile-binding" ? { operation_id, entries: batchEntries } : { operation_id, kind, entries: batchEntries });
      receipts.push({ operation_id, kind, payload_digest, record_count: items.length, changed_count: items.filter((item) => item.changed).length, unchanged_count: items.filter((item) => !item.changed).length, rollback_of: null, item_count: items.length, all_live_match: true, items_digest: digest(items), items });
      ledger.push({ event: "batch-applied", operation_id, kind, result: { payload_digest } }, { event: "batch-readback-verified", operation_id, records: items.length });
    }
  }
  return { projection, plan, ledger, receipts };
}

test("activeLedgerOperations excludes operations proven rolled back", () => {
  const ledger = [{ event: "batch-applied", operation_id: "old", kind: "verification" }, { event: "batch-readback-verified", operation_id: "old", records: 1 }, { event: "rollback-applied", operation_id: "undo", rollback_of: "old" }];
  assert.deepEqual(activeLedgerOperations(ledger), { active: [], rolledBack: ["old"] });
});

test("completion evidence proves immutable counts, exact receipts, and live state", () => {
  const input = fixture(); const report = sealReport(validateCompletionEvidence({ ...input, ledgerSha256: "d".repeat(64) }));
  assert.equal(report.complete, true, JSON.stringify({ gates: report.gates, errors: report.coverage.unexpectedOrInvalidEvidence, pending: report.coverage.pendingActionableItemIds.slice(0, 5) })); assert.equal(report.actual.profileCreates, 21); assert.equal(report.actual.profileBinds, 5);
  assert.equal(report.actual.profileNoWriteJournals, 22); assert.equal(report.actual.verificationDecisionsAccounted, 2_127);
  assert.equal(report.actual.logicalSocialAssets, 9_172); assert.equal(report.actual.uniqueSocialObjects, 9_171); assert.match(report.reportSha256, /^[a-f0-9]{64}$/);
});

test("one live-state mismatch fails completion", () => {
  const input = fixture(); input.receipts[0].items[0].live_matches = false; input.receipts[0].all_live_match = false; input.receipts[0].items_digest = digest(input.receipts[0].items);
  const report = validateCompletionEvidence({ ...input, ledgerSha256: "d".repeat(64) });
  assert.equal(report.complete, false); assert.ok(report.coverage.unexpectedOrInvalidEvidence.some((error) => error.startsWith("Live state drift")));
});

test("canonical profile reconciliation supersedes legacy source receipt without hiding it", () => {
  const input = fixture();
  const entry = input.plan.entries.find((item) => item.kind === "profile-binding");
  const operation_id = "canonical-profile-reconciliation";
  const items = [{ item_operation_id: "reconciliation-journal-item", kind: "profile-binding", changed: false, live_matches: true, expected_after_digest: "c".repeat(64), current_digest: "c".repeat(64), verification_live_matches: true, satisfied_item_operation_ids: [entry.item_operation_id] }];
  const payload_digest = digest({ operation_id, entries: [entry] });
  input.receipts.push({ operation_id, kind: "profile-binding", payload_digest, record_count: 1, changed_count: 0, unchanged_count: 1, rollback_of: null, item_count: 1, all_live_match: true, items_digest: digest(items), items });
  input.ledger.push({ event: "batch-applied", operation_id, kind: "profile-binding", result: { payload_digest } }, { event: "batch-readback-verified", operation_id, records: 1 });
  const report = validateCompletionEvidence({ ...input, ledgerSha256: "d".repeat(64) });
  assert.equal(report.complete, true, JSON.stringify(report.coverage.unexpectedOrInvalidEvidence));
  assert.equal(report.coverage.activeOperationProofs.find((proof) => proof.operation_id === operation_id).role, "canonical-profile-binding-reconciliation");
});
