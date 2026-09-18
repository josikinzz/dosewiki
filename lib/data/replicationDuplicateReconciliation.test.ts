import { afterEach, describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "@server/postgres/runtime/dataModel";
import {
  applyDuplicateSuppressionBatchHandler,
  duplicateReplicationSnapshotMatches,
  rollbackDuplicateSuppressionBatchHandler,
  validateDuplicateReconciliation,
} from "../../server/lib/replicationDuplicateReconciliation";
import type { DuplicateSuppressionUpdate } from "../../server/lib/replicationDuplicateValidators";
import type { MutationCtx } from "@server/postgres/runtime/server";

const KEEPER_ID = "keeper-id" as Id<"replications">;
const DUPLICATE_ID = "duplicate-id" as Id<"replications">;
const EVIDENCE = "a".repeat(64);
const TOKEN = "scoped-test-token";

function update(): DuplicateSuppressionUpdate {
  return {
    expected_keeper: {
      id: KEEPER_ID,
      slug: "original-keeper",
      artist: "Known Artist",
      source_catalog_id: "candidate-image-0001",
      source_sha256: null,
      publication_state: null,
      duplicate_of_replication_id: null,
    },
    expected_suppressed: {
      id: DUPLICATE_ID,
      slug: "reddit-copy-abc123",
      artist: "Unknown Artist",
      source_catalog_id: `reddit-sha256:${"b".repeat(64)}`,
      source_sha256: "b".repeat(64),
      publication_state: null,
      duplicate_of_replication_id: null,
    },
    reconciliation: {
      component_id: "cross-collection-0001",
      evidence_digest: EVIDENCE,
      classification: "same-work-confirmed-prior-multi-method-review",
      keeper_policy: "original-collection-default",
      reddit_post_ids: ["abc123"],
      source_references: [{
        reference_id: "abc123:000:source",
        post_id: "abc123",
        post_url: "https://www.reddit.com/r/replications/comments/abc123/example/",
        poster_display_name: "Poster",
        poster_profile_url: "https://www.reddit.com/user/Poster/",
        source_url: "https://i.redd.it/example.jpg",
        role: "primary",
      }],
    },
  };
}

function storedReplication(expected: DuplicateSuppressionUpdate["expected_keeper"]) {
  return {
    _id: expected.id,
    _creationTime: 1,
    slug: expected.slug,
    title: expected.slug,
    artist: expected.artist,
    type: "image",
    format: "webp",
    created_at: "2026-08-31T00:00:00.000Z",
    ...(expected.source_catalog_id ? { source_catalog_id: expected.source_catalog_id } : {}),
    ...(expected.source_sha256 ? { source_sha256: expected.source_sha256 } : {}),
    ...(expected.publication_state ? { publication_state: expected.publication_state } : {}),
    ...(expected.duplicate_of_replication_id
      ? { duplicate_of_replication_id: expected.duplicate_of_replication_id }
      : {}),
  };
}

function mutationContext(value: DuplicateSuppressionUpdate) {
  const replications = [
    storedReplication(value.expected_keeper),
    storedReplication(value.expected_suppressed),
  ] as Array<Record<string, unknown>>;
  const reconciliations: Array<Record<string, unknown>> = [];
  const patch = vi.fn(async (id: string, fields: Record<string, unknown>) => {
    const row = [...replications, ...reconciliations].find((item) => item._id === id);
    if (!row) throw new Error(`missing test row ${id}`);
    for (const [key, fieldValue] of Object.entries(fields)) {
      if (fieldValue === undefined) delete row[key];
      else row[key] = fieldValue;
    }
  });
  const insert = vi.fn(async (table: string, fields: Record<string, unknown>) => {
    if (table !== "replicationDuplicateReconciliations") throw new Error(`unexpected ${table}`);
    reconciliations.push({
      _id: `reconciliation-${reconciliations.length + 1}`,
      _creationTime: 2,
      ...fields,
    });
    return reconciliations[reconciliations.length - 1]._id;
  });
  const query = vi.fn((table: string) => ({
    withIndex: (_index: string, apply: (query: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
      let field = "";
      let expected: unknown;
      apply({
        eq(nextField, nextValue) {
          field = nextField;
          expected = nextValue;
          return this;
        },
      });
      const source = table === "replicationDuplicateReconciliations" ? reconciliations : [];
      const matches = source.filter((row) => row[field] === expected);
      return {
        unique: async () => {
          if (matches.length > 1) throw new Error("test query is not unique");
          return matches[0] ?? null;
        },
      };
    },
  }));
  const ctx = {
    db: {
      get: vi.fn(async (id: string) => replications.find((row) => row._id === id) ?? null),
      patch,
      insert,
      query,
    },
  } as unknown as MutationCtx;
  return { ctx, patch, insert, replications, reconciliations };
}

describe("replication duplicate reconciliation", () => {
  afterEach(() => {
    delete process.env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE;
  });
  it("accepts an evidence-bound original-collection keeper", () => {
    expect(() => validateDuplicateReconciliation(update())).not.toThrow();
  });

  it("rejects self-suppression and unbound Reddit provenance", () => {
    const self = update();
    self.expected_suppressed.id = KEEPER_ID;
    expect(() => validateDuplicateReconciliation(self)).toThrow("keeper equals duplicate");

    const unbound = update();
    unbound.reconciliation.source_references[0].post_id = "different";
    expect(() => validateDuplicateReconciliation(unbound)).toThrow("invalid or repeated");
  });

  it("rejects a keeper that is itself duplicate-suppressed", () => {
    const value = update();
    value.expected_keeper.publication_state = "duplicate-suppressed";
    value.expected_keeper.duplicate_of_replication_id = DUPLICATE_ID;
    expect(() => validateDuplicateReconciliation(value)).toThrow("keeper is already suppressed");
  });

  it("compares every publication and source identity CAS field", () => {
    const value = update();
    const row = {
      _id: KEEPER_ID,
      slug: value.expected_keeper.slug,
      artist: value.expected_keeper.artist,
      source_catalog_id: value.expected_keeper.source_catalog_id ?? undefined,
      source_sha256: undefined,
      publication_state: undefined,
      duplicate_of_replication_id: undefined,
    } as Doc<"replications">;
    expect(duplicateReplicationSnapshotMatches(row, value.expected_keeper)).toBe(true);
    expect(duplicateReplicationSnapshotMatches(
      { ...row, publication_state: "duplicate-suppressed" },
      value.expected_keeper,
    )).toBe(false);
  });

  it("dry-runs, applies, retries, and rolls back without deleting evidence", async () => {
    process.env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE = TOKEN;
    const value = update();
    const { ctx, patch, insert, replications, reconciliations } = mutationContext(value);
    const args = {
      apiKey: TOKEN,
      operation_id: "known-duplicates-batch-01",
      dry_run: true,
      updates: [value],
    };

    await expect(applyDuplicateSuppressionBatchHandler(ctx, args)).resolves.toMatchObject({
      dry_run: true,
      suppressed: 1,
      rows: [{ action: "would-suppress" }],
    });
    expect(patch).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();

    await expect(applyDuplicateSuppressionBatchHandler(ctx, {
      ...args,
      dry_run: false,
    })).resolves.toMatchObject({ suppressed: 1, rows: [{ action: "suppressed" }] });
    expect(replications.find((row) => row._id === DUPLICATE_ID)).toMatchObject({
      publication_state: "duplicate-suppressed",
      duplicate_of_replication_id: KEEPER_ID,
      duplicate_evidence_digest: EVIDENCE,
    });
    expect(reconciliations).toHaveLength(1);

    await expect(applyDuplicateSuppressionBatchHandler(ctx, {
      ...args,
      dry_run: false,
    })).resolves.toMatchObject({ unchanged: 1, rows: [{ action: "unchanged" }] });

    const rollback = {
      apiKey: TOKEN,
      operation_id: "known-duplicates-rollback-01",
      dry_run: false,
      updates: [{
        component_id: value.reconciliation.component_id,
        keeper_id: KEEPER_ID,
        suppressed_id: DUPLICATE_ID,
        evidence_digest: EVIDENCE,
      }],
    };
    await expect(rollbackDuplicateSuppressionBatchHandler(ctx, rollback)).resolves.toMatchObject({
      restored: 1,
      rows: [{ action: "restored" }],
    });
    expect(replications.find((row) => row._id === DUPLICATE_ID)).not.toHaveProperty(
      "publication_state",
    );
    expect(reconciliations[0]).toMatchObject({ state: "rolled-back" });

    await expect(rollbackDuplicateSuppressionBatchHandler(ctx, rollback)).resolves.toMatchObject({
      unchanged: 1,
      rows: [{ action: "unchanged" }],
    });
    expect(reconciliations).toHaveLength(1);
  });
});
