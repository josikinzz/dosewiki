import { afterEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@server/postgres/runtime/dataModel";
import type { MutationCtx } from "@server/postgres/runtime/server";
import {
  applyAttributionBatchHandler,
  attributionReplicationSnapshotMatches,
  rollbackAttributionBatchHandler,
  validateAttributionUpdate,
} from "../../server/lib/replicationAttribution";
import type { AttributionBatchUpdate } from "../../server/lib/replicationAttributionValidators";

const SHA = "a".repeat(64);
const DIGEST = "b".repeat(64);
const ID = "k570001ahn17r642ptx0pr4hps8dgg0s" as Id<"replications">;
const TOKEN = "scoped-test-token";

function update(overrides: Partial<AttributionBatchUpdate> = {}): AttributionBatchUpdate {
  return {
    expected: {
      id: ID,
      slug: "example-reddit-post",
      artist: "Unknown Artist",
      artist_url: null,
      credit_line: "Creator unknown.",
      rightsholder: null,
      source_catalog_id: `reddit-sha256:${SHA}`,
      source_sha256: SHA,
    },
    intended_credit: {
      artist: "ExamplePoster",
      artist_url: "https://www.reddit.com/user/ExamplePoster/",
      credit_line: "Posted by ExamplePoster on r/replications.",
      rightsholder: null,
    },
    attribution: {
      reddit_post_ids: ["abc123"],
      poster: {
        display_name: "ExamplePoster",
        normalized_name: "exampleposter",
        profile_url: "https://www.reddit.com/user/ExamplePoster/",
        state: "named",
        source_role: "submitter",
      },
      source_references: [{
        reference_id: "abc123:000:example",
        post_id: "abc123",
        post_url: "https://www.reddit.com/r/replications/comments/abc123/example/",
        poster_display_name: "ExamplePoster",
        poster_profile_url: "https://www.reddit.com/user/ExamplePoster/",
        source_url: "https://i.imgur.com/example.jpg",
        role: "primary",
      }],
      disposition: "poster-as-artist-default",
      proposed_artist: "ExamplePoster",
      review_required: false,
      source_digest: DIGEST,
    },
    ...overrides,
  };
}

function mutationContext(value: AttributionBatchUpdate) {
  const row: Record<string, unknown> = {
    _id: value.expected.id,
    _creationTime: 1,
    slug: value.expected.slug,
    title: "Example Reddit post",
    artist: value.expected.artist,
    credit_line: value.expected.credit_line ?? undefined,
    source_catalog_id: value.expected.source_catalog_id,
    source_sha256: value.expected.source_sha256,
  };
  const attributions: Array<Record<string, unknown>> = [];
  const patch = vi.fn(async (_id: string, fields: Record<string, unknown>) => {
    for (const [key, fieldValue] of Object.entries(fields)) {
      if (fieldValue === undefined) delete row[key];
      else row[key] = fieldValue;
    }
  });
  const insert = vi.fn(async (table: string, fields: Record<string, unknown>) => {
    if (table !== "replicationSourceAttribution") throw new Error(`unexpected ${table}`);
    attributions.push({ _id: "attribution-1", _creationTime: 2, ...fields });
    return "attribution-1";
  });
  const remove = vi.fn(async (id: string) => {
    const index = attributions.findIndex((item) => item._id === id);
    if (index < 0) throw new Error(`missing attribution ${id}`);
    attributions.splice(index, 1);
  });
  const ctx = {
    db: {
      get: vi.fn(async () => row),
      patch,
      insert,
      delete: remove,
      query: vi.fn(() => ({
        withIndex: () => ({ unique: async () => attributions[0] ?? null }),
      })),
    },
  } as unknown as MutationCtx;
  return { ctx, patch, insert, remove, row, attributions };
}

describe("replication attribution contract", () => {
  afterEach(() => {
    delete process.env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE;
  });
  it("accepts a named poster as the default public artist", () => {
    expect(() => validateAttributionUpdate(update())).not.toThrow();
  });

  it("accepts a reviewed creator override without promoting the poster", () => {
    const value = update();
    value.intended_credit.artist = "Credited Creator";
    value.intended_credit.artist_url = null;
    value.attribution.proposed_artist = "Credited Creator";
    value.attribution.disposition = "reviewed-creator-override";
    value.attribution.reviewed_creator_override = {
      creator_name: "Credited Creator",
      creator_kind: "person",
      decision: "verified",
      evidence_digest: "c".repeat(64),
    };
    expect(() => validateAttributionUpdate(value)).not.toThrow();
  });

  it("keeps multi-poster rows review-required", () => {
    const value = update();
    value.attribution.poster = { state: "multiple", source_role: "submitter" };
    value.attribution.disposition = "multiple-posters-require-review";
    value.attribution.review_required = true;
    expect(() => validateAttributionUpdate(value)).not.toThrow();

    value.attribution.review_required = false;
    expect(() => validateAttributionUpdate(value)).toThrow("must remain review-required");
  });

  it("rejects unbound source references and non-Reddit profile URLs", () => {
    const unbound = update();
    unbound.attribution.source_references[0].post_id = "different";
    expect(() => validateAttributionUpdate(unbound)).toThrow("not bound");

    const foreignProfile = update();
    foreignProfile.attribution.poster.profile_url = "https://example.com/ExamplePoster";
    expect(() => validateAttributionUpdate(foreignProfile)).toThrow("Reddit profile URL");
  });

  it("compares every guarded credit and source identity field", () => {
    const value = update();
    const row = {
      _id: ID,
      slug: value.expected.slug,
      artist: value.expected.artist,
      artist_url: undefined,
      credit_line: value.expected.credit_line ?? undefined,
      rightsholder: undefined,
      source_catalog_id: value.expected.source_catalog_id,
      source_sha256: value.expected.source_sha256,
    };
    expect(attributionReplicationSnapshotMatches(row, value.expected)).toBe(true);
    expect(attributionReplicationSnapshotMatches(
      { ...row, artist: "Changed Artist" },
      value.expected,
    )).toBe(false);
  });

  it("dry-runs without patching either the replication or attribution table", async () => {
    process.env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE = TOKEN;
    const value = update();
    const { ctx, patch, insert, row, attributions } = mutationContext(value);

    await expect(applyAttributionBatchHandler(ctx, {
      apiKey: TOKEN,
      operation_id: "replication-index-attribution-dry-run-01",
      dry_run: true,
      updates: [value],
    })).resolves.toEqual({ updated: 1, unchanged: 0 });

    expect(patch).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(row.artist).toBe("Unknown Artist");
    expect(attributions).toHaveLength(0);
  });

  it("applies and exactly rolls back a reviewed attribution", async () => {
    process.env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE = TOKEN;
    const value = update();
    const { ctx, row, attributions } = mutationContext(value);
    const applyOperation = "replication-index-attribution-apply-01";

    await applyAttributionBatchHandler(ctx, {
      apiKey: TOKEN,
      operation_id: applyOperation,
      dry_run: false,
      updates: [value],
    });
    expect(row.artist).toBe("ExamplePoster");
    expect(attributions).toHaveLength(1);

    const rollback = {
      apiKey: TOKEN,
      operation_id: "replication-index-attribution-rollback-01",
      dry_run: true,
      updates: [{
        expected_current: {
          ...value.expected,
          ...value.intended_credit,
          id: value.expected.id,
          slug: value.expected.slug,
          source_catalog_id: value.expected.source_catalog_id,
          source_sha256: value.expected.source_sha256,
        },
        rollback_credit: {
          artist: value.expected.artist,
          artist_url: value.expected.artist_url,
          credit_line: value.expected.credit_line,
          rightsholder: value.expected.rightsholder,
        },
        source_digest: value.attribution.source_digest,
        expected_attribution_operation_id: applyOperation,
      }],
    };
    await expect(rollbackAttributionBatchHandler(ctx, rollback)).resolves.toEqual({
      restored: 1,
      unchanged: 0,
    });
    expect(row.artist).toBe("ExamplePoster");
    expect(attributions).toHaveLength(1);

    await expect(rollbackAttributionBatchHandler(ctx, {
      ...rollback,
      dry_run: false,
    })).resolves.toEqual({ restored: 1, unchanged: 0 });
    expect(row.artist).toBe("Unknown Artist");
    expect(attributions).toHaveLength(0);

    await expect(rollbackAttributionBatchHandler(ctx, {
      ...rollback,
      dry_run: false,
    })).resolves.toEqual({ restored: 0, unchanged: 1 });
  });
});
