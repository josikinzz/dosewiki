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

test("later authenticated satisfied-item receipt supersedes only the named earlier drift", () => {
  const input = fixture();
  const earlierReceipt = input.receipts.find((receipt) => receipt.kind === "profile-binding");
  const earlierItem = earlierReceipt.items[0];
  earlierItem.live_matches = false;
  earlierReceipt.all_live_match = false;
  earlierReceipt.items_digest = digest(earlierReceipt.items);
  const earlierApplied = input.ledger.find((row) => row.event === "batch-applied" && row.operation_id === earlierReceipt.operation_id);
  earlierApplied.at = 100;

  const laterReceipt = input.receipts.find((receipt) => receipt.kind === "verification");
  laterReceipt.items[0].satisfied_item_operation_ids = [earlierItem.item_operation_id];
  laterReceipt.items_digest = digest(laterReceipt.items);
  const laterEntry = input.plan.entries.find((entry) => entry.item_operation_id === laterReceipt.items[0].item_operation_id);
  laterEntry.satisfied_item_operation_ids = [earlierItem.item_operation_id];
  laterReceipt.payload_digest = digest({ operation_id: laterReceipt.operation_id, kind: laterReceipt.kind, entries: input.plan.entries.filter((entry) => entry.kind === "verification").slice(0, 50) });
  const laterApplied = input.ledger.find((row) => row.event === "batch-applied" && row.operation_id === laterReceipt.operation_id);
  laterApplied.at = 200;
  laterApplied.result.payload_digest = laterReceipt.payload_digest;

  const report = validateCompletionEvidence({ ...input, ledgerSha256: "d".repeat(64) });
  assert.equal(report.complete, true, JSON.stringify(report.coverage.unexpectedOrInvalidEvidence));
  assert.deepEqual(
    report.coverage.activeOperationProofs.find((proof) => proof.operation_id === earlierReceipt.operation_id).superseded_drift_items,
    [earlierItem.item_operation_id],
  );
  assert.equal(report.coverage.supersedingOperationProofs[0].proof_kind, "later-authenticated-identity-social-receipt");
});

test("supplemental authenticated proof exempts its exact item but not unrelated drift", () => {
  const input = fixture();
  const receipt = input.receipts.find((item) => item.kind === "avatar");
  receipt.items[0].live_matches = false;
  receipt.items[1].live_matches = false;
  receipt.all_live_match = false;
  receipt.items_digest = digest(receipt.items);
  const supersededEntry = input.plan.entries.find((entry) => entry.item_operation_id === receipt.items[0].item_operation_id);
  supersededEntry.value = { profile_id: "profile-josie", media_digest: "a".repeat(64) };
  const proofCore = {
    proof_kind: "authenticated-profile-curation",
    operation_id: "identity-social-batch:avatar:replacement",
    superseded_item_operation_ids: [receipt.items[0].item_operation_id],
    live_matches: true,
    applied_at: 300,
    evidence: {
      profile_id: supersededEntry.value.profile_id,
      superseded_media_digest: supersededEntry.value.media_digest,
      current_media_digest: "e".repeat(64),
    },
  };
  const proofDigest = digest(proofCore);
  const proof = { ...proofCore, proof_id: `supplemental-supersession:${proofDigest.slice(0, 24)}`, evidence_digest: proofDigest };
  const report = validateCompletionEvidence({ ...input, ledgerSha256: "d".repeat(64), supplementalSupersessions: [proof] });
  assert.equal(report.complete, false);
  assert.ok(report.coverage.unexpectedOrInvalidEvidence.some((error) => error.includes(receipt.items[1].item_operation_id)));
  assert.deepEqual(
    report.coverage.activeOperationProofs.find((proofItem) => proofItem.operation_id === receipt.operation_id).superseded_drift_items,
    [receipt.items[0].item_operation_id],
  );
});

test("malformed supplemental supersession cannot hide drift", () => {
  const input = fixture();
  const receipt = input.receipts.find((item) => item.kind === "alias");
  receipt.items[0].live_matches = false;
  receipt.all_live_match = false;
  receipt.items_digest = digest(receipt.items);
  const report = validateCompletionEvidence({
    ...input,
    ledgerSha256: "d".repeat(64),
    supplementalSupersessions: [{
      proof_id: "forged",
      proof_kind: "authenticated-profile-merge",
      operation_id: "merge",
      superseded_item_operation_ids: [receipt.items[0].item_operation_id],
      live_matches: false,
      applied_at: 300,
      evidence_digest: "e".repeat(64),
    }],
  });
  assert.equal(report.complete, false);
  assert.ok(report.coverage.unexpectedOrInvalidEvidence.some((error) => error.includes("Invalid supplemental")));
  assert.ok(report.coverage.unexpectedOrInvalidEvidence.some((error) => error.includes(receipt.items[0].item_operation_id)));
});

test("validly sealed but semantically unrelated supplemental proof cannot hide drift", () => {
  const input = fixture();
  const receipt = input.receipts.find((item) => item.kind === "alias");
  receipt.items[0].live_matches = false;
  receipt.all_live_match = false;
  receipt.items_digest = digest(receipt.items);
  const entry = input.plan.entries.find((item) => item.item_operation_id === receipt.items[0].item_operation_id);
  entry.value = { profile_id: "expected-profile", normalized_alias: "expected-source" };
  const core = {
    proof_kind: "authenticated-profile-merge",
    operation_id: "merge",
    superseded_item_operation_ids: [receipt.items[0].item_operation_id],
    live_matches: true,
    applied_at: 300,
    evidence: { target_profile_id: "another-profile", source_key: "another-source" },
  };
  const proofDigest = digest(core);
  const report = validateCompletionEvidence({
    ...input,
    ledgerSha256: "d".repeat(64),
    supplementalSupersessions: [{ ...core, proof_id: `supplemental-supersession:${proofDigest.slice(0, 24)}`, evidence_digest: proofDigest }],
  });
  assert.equal(report.complete, false);
  assert.ok(report.coverage.unexpectedOrInvalidEvidence.some((error) => error.includes("not semantically bound")));
  assert.ok(report.coverage.unexpectedOrInvalidEvidence.some((error) => error.startsWith("Live state drift")));
});
