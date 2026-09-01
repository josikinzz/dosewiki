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

function indexSupersedingEvidence({ expected, active, receipts, supplementalSupersessions, errors }) {
  const activeById = new Map(active.map((operation) => [operation.operation_id, operation]));
  const result = new Map();
  const add = (itemId, proof) => {
    if (!expected.has(itemId)) { errors.push(`Supersession ${proof.proof_id} references unexpected item ${itemId}.`); return; }
    if (result.has(itemId)) { errors.push(`Planned item ${itemId} has multiple superseding proofs.`); return; }
    result.set(itemId, proof);
  };

  // Some campaign operations deliberately aggregate an earlier item into a
  // later journal item (ELOHPROJECTS is the production example). The later
  // authenticated receipt is sufficient only when it is live, explicitly
  // names the earlier item, and was applied after that item's own operation.
  const sourceOperationByItem = new Map();
  for (const receipt of receipts) for (const item of receipt.items ?? []) {
    if (expected.has(item.item_operation_id)) sourceOperationByItem.set(item.item_operation_id, receipt.operation_id);
  }
  for (const receipt of receipts) {
    const later = activeById.get(receipt.operation_id);
    if (!later || !receipt.all_live_match) continue;
    for (const item of receipt.items ?? []) {
      if (!item.live_matches) continue;
      for (const satisfiedId of item.satisfied_item_operation_ids ?? []) {
        if (satisfiedId === item.item_operation_id || !expected.has(satisfiedId)) continue;
        const earlier = activeById.get(sourceOperationByItem.get(satisfiedId));
        if (!earlier || !Number.isFinite(earlier.application.at) || !Number.isFinite(later.application.at)
          || later.application.at <= earlier.application.at) continue;
        add(satisfiedId, {
          proof_id: `identity-social-receipt:${receipt.operation_id}:${item.item_operation_id}`,
          proof_kind: "later-authenticated-identity-social-receipt",
          operation_id: receipt.operation_id,
          item_operation_id: item.item_operation_id,
          superseded_item_operation_ids: [satisfiedId],
          live_matches: true,
          applied_at: later.application.at,
        });
      }
    }
  }

  for (const proof of supplementalSupersessions ?? []) {
    const proofCore = proof ? {
      proof_kind: proof.proof_kind,
      operation_id: proof.operation_id,
      superseded_item_operation_ids: proof.superseded_item_operation_ids,
      live_matches: proof.live_matches,
      applied_at: proof.applied_at,
      evidence: proof.evidence,
    } : null;
    if (!proof || typeof proof.proof_id !== "string" || typeof proof.operation_id !== "string"
      || !["authenticated-profile-merge", "authenticated-profile-curation"].includes(proof.proof_kind)
      || proof.live_matches !== true || !Number.isFinite(proof.applied_at)
      || !Array.isArray(proof.superseded_item_operation_ids) || proof.superseded_item_operation_ids.length === 0
      || !proof.evidence || proof.evidence_digest !== digest(proofCore)
      || proof.proof_id !== `supplemental-supersession:${digest(proofCore).slice(0, 24)}`) {
      errors.push(`Invalid supplemental supersession proof ${proof?.proof_id ?? "(missing id)"}.`);
      continue;
    }
    for (const itemId of proof.superseded_item_operation_ids) {
      const entry = expected.get(itemId);
      const normalized = (value) => String(value ?? "").trim().toLocaleLowerCase("en-US");
      const semanticallyBound = proof.proof_kind === "authenticated-profile-merge"
        ? entry?.kind === "alias"
          && entry.value?.profile_id === proof.evidence.target_profile_id
          && normalized(entry.value?.normalized_alias) === normalized(proof.evidence.source_key)
        : entry?.kind === "avatar"
          && entry.value?.profile_id === proof.evidence.profile_id
          && entry.value?.media_digest === proof.evidence.superseded_media_digest;
      if (!semanticallyBound) {
        errors.push(`Supplemental supersession ${proof.proof_id} is not semantically bound to ${itemId}.`);
        continue;
      }
      add(itemId, proof);
    }
  }
  return result;
}

export function validateCompletionEvidence({ projection, plan, ledger, receipts, ledgerSha256, allowedLegacyItemIds = [], supplementalSupersessions = [], supplementalLedgerSha256 = {} }) {
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
  const supersedingEvidence = indexSupersedingEvidence({ expected, active, receipts, supplementalSupersessions, errors });
  for (const ledgerOperation of active) {
    const receipt = receiptById.get(ledgerOperation.operation_id);
    if (!receipt) { errors.push(`Missing authenticated receipt ${ledgerOperation.operation_id}.`); continue; }
    if (receipt.kind !== ledgerOperation.kind) errors.push(`Kind mismatch for ${receipt.operation_id}.`);
    if (receipt.item_count !== receipt.record_count || receipt.items.length !== receipt.record_count) errors.push(`Record count mismatch for ${receipt.operation_id}.`);
    if (ledgerOperation.verification.records !== receipt.item_count) errors.push(`Ledger readback count mismatch for ${receipt.operation_id}.`);
    const unsupersededDrift = receipt.items.filter((item) => !item.live_matches && !supersedingEvidence.has(item.item_operation_id));
    if (unsupersededDrift.length > 0) {
      errors.push(`Live state drift for ${receipt.operation_id}: ${unsupersededDrift.map((item) => item.item_operation_id).join(", ")}.`);
    }
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
      superseded_drift_items: receipt.items.filter((item) => !item.live_matches && supersedingEvidence.has(item.item_operation_id)).map((item) => item.item_operation_id),
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
  const usedSupersedingProofIds = new Set(receipts.flatMap((receipt) => receipt.items ?? [])
    .filter((item) => !item.live_matches && supersedingEvidence.has(item.item_operation_id))
    .map((item) => supersedingEvidence.get(item.item_operation_id).proof_id));
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
      profileMergeLedgerSha256: supplementalLedgerSha256.profileMerge ?? null,
      profileCurationLedgerSha256: supplementalLedgerSha256.profileCuration ?? null,
      supplementalSupersessionSetSha256: digest(supplementalSupersessions),
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
      supersedingOperationProofs: [...new Map([...supersedingEvidence.values()]
        .filter((proof) => usedSupersedingProofIds.has(proof.proof_id))
        .map((proof) => [proof.proof_id, proof])).values()]
        .sort((left, right) => left.proof_id.localeCompare(right.proof_id)),
    },
    safety: {
      mutationsInvoked: 0,
      sourceDeletionOperations: 0,
      basis: "The validator calls authenticated read-only receipt and profile-state queries only; projection actions and ledger events contain no deletion operation.",
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
