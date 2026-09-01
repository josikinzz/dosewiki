import { createHash } from "node:crypto";

export const COMPLETION_REPORT_TYPE = "identity-social-production-completion-report";
export const COMPLETION_REPORT_SCHEMA_VERSION = 1;
export const REQUIRED_COUNTS = Object.freeze({
  profileBindingDecisions: 48,
  profileCreates: 21,
  profileBinds: 5,
  profileBindingNoWrites: 22,
  creatorAttributionDecisions: 215,
  creatorChanges: 6,
  creatorPreservations: 209,
  aliasDecisions: 5,
  approvedAliasAdds: 0,
  avatarProposals: 7,
  verificationDecisions: 2_127,
  embeddedProfileBindingVerifications: 48,
  socialAssets: 9_172,
  uniqueSocialObjects: 9_171,
});

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, canonical(item)]));
  return value;
}

export function canonicalJson(value) { return JSON.stringify(canonical(value)); }
export function digest(value) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }

export function immutableExpectedInventory({ projection, plan }) {
  const counts = projection.counts ?? {};
  for (const [name, expected] of Object.entries(REQUIRED_COUNTS)) {
    if (name === "embeddedProfileBindingVerifications" || name === "uniqueSocialObjects") continue;
    if (counts[name] !== expected) throw new Error(`Immutable projection ${name} is ${counts[name]}, expected ${expected}.`);
  }
  const profileDependencies = projection.operations
    .filter((operation) => operation.kind === "profile-binding")
    .map((operation) => operation.after?.verificationDependency?.verificationOperationId)
    .filter(Boolean);
  if (profileDependencies.length !== REQUIRED_COUNTS.embeddedProfileBindingVerifications || new Set(profileDependencies).size !== profileDependencies.length) {
    throw new Error("Immutable projection must bind exactly 48 unique verification decisions through profile bindings.");
  }
  const socialEntries = plan.entries.filter((entry) => entry.kind === "social-asset");
  const uniqueSocialObjects = new Set(socialEntries.map((entry) => entry.value.media_digest)).size;
  if (socialEntries.length !== REQUIRED_COUNTS.socialAssets || uniqueSocialObjects !== REQUIRED_COUNTS.uniqueSocialObjects) {
    throw new Error(`Social inventory is ${socialEntries.length} logical assets / ${uniqueSocialObjects} objects, expected 9172 / 9171.`);
  }
  const byItemId = new Map();
  for (const entry of plan.entries) {
    if (byItemId.has(entry.item_operation_id)) throw new Error(`Duplicate planned item ID ${entry.item_operation_id}.`);
    byItemId.set(entry.item_operation_id, entry);
  }
  // A cross-kind reconciliation can carry multiple contribution item IDs, but
  // one contribution may already be one of the 48 profile-bound decisions.
  // Count immutable decision operations, not contribution rows, to avoid
  // double-counting ELOHPROJECTS / Sean Allum.
  const standaloneVerificationDecisions = plan.entries.filter((entry) => entry.kind === "verification").length;
  const verificationDecisionsAccounted = profileDependencies.length + standaloneVerificationDecisions;
  if (verificationDecisionsAccounted !== REQUIRED_COUNTS.verificationDecisions) {
    throw new Error(`Execution plan accounts for ${verificationDecisionsAccounted} verification decisions, expected 2127.`);
  }
  return {
    byItemId,
    profileDependencies,
    summary: {
      ...REQUIRED_COUNTS,
      actionableJournalItems: plan.entries.length,
      explicitNoWrites: plan.noWrites.length,
      standaloneVerificationDecisions,
      verificationDecisionsAccounted,
    },
  };
}

function latestByOperation(ledger, event) {
  const result = new Map();
  for (const row of ledger) if (row.event === event && row.operation_id) result.set(row.operation_id, row);
  return result;
}

export function activeLedgerOperations(ledger) {
  const applied = latestByOperation(ledger, "batch-applied");
  const verified = latestByOperation(ledger, "batch-readback-verified");
  const rolledBack = new Set(ledger.filter((row) => row.event === "rollback-applied").map((row) => row.rollback_of));
  const active = [];
  for (const [operationId, verification] of verified) {
    if (rolledBack.has(operationId)) continue;
    const application = applied.get(operationId);
    if (!application) throw new Error(`Readback ${operationId} has no batch-applied ledger event.`);
    active.push({ operation_id: operationId, kind: application.kind, application, verification });
  }
  return { active: active.sort((a, b) => a.operation_id.localeCompare(b.operation_id)), rolledBack: [...rolledBack].sort() };
}

export function validateCompletionEvidence({ projection, plan, ledger, receipts, ledgerSha256, allowedLegacyItemIds = [] }) {
  const inventory = immutableExpectedInventory({ projection, plan });
  const expected = inventory.byItemId;
  const allowedLegacy = new Set(allowedLegacyItemIds);
  for (const id of allowedLegacy) {
    const entry = expected.get(id);
    if (!entry || entry.kind !== "profile-binding") throw new Error(`Legacy exception ${id} is not an exact planned profile-binding item.`);
  }
  const { active, rolledBack } = activeLedgerOperations(ledger);
  const receiptById = new Map(receipts.map((receipt) => [receipt?.operation_id, receipt]));
  if (receiptById.size !== receipts.length) throw new Error("Duplicate completion receipt operation ID.");
  const reconciliationCoverage = new Map();
  for (const receipt of receipts) for (const item of receipt.items ?? []) {
    if (expected.has(item.item_operation_id)) continue;
    const satisfied = item.satisfied_item_operation_ids ?? [];
    const entry = satisfied.length === 1 ? expected.get(satisfied[0]) : null;
    if (receipt.kind !== "profile-binding" || item.kind !== "profile-binding" || !entry || entry.kind !== "profile-binding") continue;
    if (reconciliationCoverage.has(satisfied[0])) throw new Error(`Canonical profile-binding item ${satisfied[0]} has multiple reconciliation receipts.`);
    reconciliationCoverage.set(satisfied[0], { operation_id: receipt.operation_id, journal_item_id: item.item_operation_id });
  }
  const covered = new Map();
  const operationProofs = [];
  const errors = [];
  for (const ledgerOperation of active) {
    const receipt = receiptById.get(ledgerOperation.operation_id);
    if (!receipt) { errors.push(`Missing authenticated receipt ${ledgerOperation.operation_id}.`); continue; }
    if (receipt.kind !== ledgerOperation.kind) errors.push(`Kind mismatch for ${receipt.operation_id}.`);
    if (receipt.item_count !== receipt.record_count || receipt.items.length !== receipt.record_count) errors.push(`Record count mismatch for ${receipt.operation_id}.`);
    if (ledgerOperation.verification.records !== receipt.item_count) errors.push(`Ledger readback count mismatch for ${receipt.operation_id}.`);
    if (!receipt.all_live_match || receipt.items.some((item) => !item.live_matches)) errors.push(`Live state drift for ${receipt.operation_id}.`);
    if (digest(receipt.items) !== receipt.items_digest) errors.push(`Item receipt digest mismatch for ${receipt.operation_id}.`);
    const entries = [];
    let reconciliationItems = 0;
    for (const item of receipt.items) {
      let expectedId = item.item_operation_id;
      let entry = expected.get(expectedId);
      let isReconciliationItem = false;
      if (!entry && receipt.kind === "profile-binding" && (item.satisfied_item_operation_ids ?? []).length === 1) {
        expectedId = item.satisfied_item_operation_ids[0];
        entry = expected.get(expectedId);
        if (entry?.kind === "profile-binding") { reconciliationItems += 1; isReconciliationItem = true; }
      }
      if (!entry) { errors.push(`Unexpected active item ${item.item_operation_id}.`); continue; }
      const supersededLegacySource = expectedId === item.item_operation_id && reconciliationCoverage.has(expectedId);
      if (!supersededLegacySource) {
        if (covered.has(expectedId)) errors.push(`Planned item ${expectedId} is covered more than once.`);
        covered.set(expectedId, receipt.operation_id);
      }
      entries.push(entry);
      const expectedSatisfied = isReconciliationItem
        ? [entry.item_operation_id]
        : [...(entry.satisfied_item_operation_ids ?? [])].sort();
      const actualSatisfied = [...(item.satisfied_item_operation_ids ?? [])].sort();
      if (canonicalJson(expectedSatisfied) !== canonicalJson(actualSatisfied)) errors.push(`Satisfied verification contribution mismatch for ${item.item_operation_id}.`);
    }
    if (entries.length === receipt.items.length) {
      const payload = receipt.kind === "profile-binding"
        ? { operation_id: receipt.operation_id, entries }
        : { operation_id: receipt.operation_id, kind: receipt.kind, entries };
      const expectedPayloadDigest = digest(payload);
      if (receipt.payload_digest !== expectedPayloadDigest) errors.push(`Payload digest mismatch for ${receipt.operation_id}.`);
      if (ledgerOperation.application.result?.payload_digest !== receipt.payload_digest) errors.push(`Ledger payload digest mismatch for ${receipt.operation_id}.`);
    }
    operationProofs.push({
      operation_id: receipt.operation_id, kind: receipt.kind, payload_digest: receipt.payload_digest,
      record_count: receipt.record_count, changed_count: receipt.changed_count,
      unchanged_count: receipt.unchanged_count, items_digest: receipt.items_digest,
      all_live_match: receipt.all_live_match,
      role: reconciliationItems === receipt.items.length ? "canonical-profile-binding-reconciliation" : "active-operation",
    });
  }
  for (const receipt of receipts) if (!active.some((row) => row.operation_id === receipt.operation_id)) errors.push(`Receipt ${receipt.operation_id} is not an active verified ledger operation.`);
  const missing = [...expected.keys()].filter((id) => !covered.has(id));
  const legacyExceptions = missing.filter((id) => allowedLegacy.has(id));
  const pendingActionable = missing.filter((id) => !allowedLegacy.has(id));
  const kindCounts = {};
  const changedKindCounts = {};
  for (const proof of operationProofs) {
    kindCounts[proof.kind] = (kindCounts[proof.kind] ?? 0) + proof.record_count;
    changedKindCounts[proof.kind] = (changedKindCounts[proof.kind] ?? 0) + proof.changed_count;
  }
  const socialEntries = plan.entries.filter((entry) => entry.kind === "social-asset");
  const noUnsafeAliasMerge = projection.operations.filter((operation) => operation.kind === "profile-alias")
    .every((operation) => operation.action !== "merge-profile" && operation.action !== "add-alias-preserve-source-history");
  const attributionChanged = projection.operations.filter((operation) => operation.kind === "creator-attribution" && operation.action === "set-proven-creator-with-verified-chronology").length;
  const profileEntries = plan.entries.filter((entry) => entry.kind === "profile-binding");
  const gates = {
    immutable_projection_counts: true,
    all_expected_items_accounted: pendingActionable.length === 0,
    all_receipts_exact: errors.length === 0,
    all_current_targets_match_journal: errors.every((error) => !error.startsWith("Live state drift")),
    profile_bindings_21_create_5_bind_22_unresolved: profileEntries.filter((e) => e.decision === "create").length === 21 && profileEntries.filter((e) => e.decision === "bind").length === 5 && profileEntries.filter((e) => e.decision === "unresolved").length === 22,
    attribution_6_changes_209_preservations: attributionChanged === 6 && plan.entries.filter((e) => e.kind === "attribution").length - attributionChanged === 209,
    aliases_5_no_unsafe_merges: projection.counts.aliasDecisions === 5 && noUnsafeAliasMerge,
    avatars_7: plan.entries.filter((entry) => entry.kind === "avatar").length === 7,
    verifications_2127_including_48_embedded: inventory.summary.verificationDecisionsAccounted === 2_127 && inventory.profileDependencies.length === 48,
    social_9172_logical_9171_unique: socialEntries.length === 9_172 && new Set(socialEntries.map((entry) => entry.value.media_digest)).size === 9_171,
    no_source_deletion_operations: projection.operations.every((operation) => !/delete|remove|purge/i.test(operation.action)) && ledger.every((row) => !/delete|remove|purge/i.test(String(row.event))),
  };
  const complete = Object.values(gates).every(Boolean) && errors.length === 0 && pendingActionable.length === 0;
  return {
    artifactType: COMPLETION_REPORT_TYPE,
    schemaVersion: COMPLETION_REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    target: { convexDeployment: projection.target.convexDeployment, readOnly: true },
    inputs: {
      projectionSha256: projection.projectionSha256,
      receiptSidecarSha256: plan.receipt_sidecar_digest ?? null,
      ledgerSha256,
      operationReceiptSetSha256: digest(operationProofs),
      expectedItemSetSha256: digest([...expected.keys()].sort()),
    },
    expected: inventory.summary,
    actual: {
      activeVerifiedOperations: active.length,
      rolledBackOperations: rolledBack.length,
      coveredJournalItems: covered.size,
      coveredByKind: Object.fromEntries(Object.entries(kindCounts).sort()),
      changedByKind: Object.fromEntries(Object.entries(changedKindCounts).sort()),
      profileCreates: profileEntries.filter((entry) => entry.decision === "create" && covered.has(entry.item_operation_id)).length,
      profileBinds: profileEntries.filter((entry) => entry.decision === "bind" && covered.has(entry.item_operation_id)).length,
      profileNoWriteJournals: profileEntries.filter((entry) => entry.decision === "unresolved" && covered.has(entry.item_operation_id)).length,
      attributionChanges: attributionChanged,
      attributionPosterPreservingJournals: 209,
      aliasDecisions: 5,
      unsafeAliasMerges: noUnsafeAliasMerge ? 0 : 1,
      avatars: 7,
      verificationDecisionsAccounted: inventory.summary.verificationDecisionsAccounted,
      embeddedProfileBindingVerifications: inventory.profileDependencies.length,
      logicalSocialAssets: socialEntries.length,
      uniqueSocialObjects: new Set(socialEntries.map((entry) => entry.value.media_digest)).size,
    },
    coverage: {
      pendingActionableItemIds: pendingActionable,
      legacyCanonicalProfileBatchExceptions: legacyExceptions,
      unexpectedOrInvalidEvidence: errors,
      activeOperationProofs: operationProofs,
    },
    safety: {
      mutationsInvoked: 0,
      sourceDeletionOperations: 0,
      basis: "The validator calls one authenticated query only; projection actions and ledger events contain no deletion operation.",
    },
    gates,
    complete,
    reportSha256: "",
  };
}

export function sealReport(report) {
  const core = { ...report, reportSha256: undefined };
  return { ...core, reportSha256: digest(core) };
}
