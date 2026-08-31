import { describe, expect, it, vi } from "vitest";

import type { MutationCtx } from "../../convex/_generated/server";
import {
  insertMediaAssetHandler,
  insertReplicationHandler,
} from "../../convex/lib/replicationWrites";
import type { InsertMediaAssetArgs } from "../../convex/lib/replicationValidators";

const SHA = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const R2_KEY = `media/sha256/01/${SHA}.webp`;

function taxonomy(overrides: Record<string, unknown> = {}) {
  return {
    source_catalog_id: "catalog-1",
    taxonomy_record_key: "catalog:catalog-1",
    replication_status: "replication",
    replication_status_confidence: "high",
    replication_status_review_required: false,
    viewing_mode: "open-eye",
    viewing_mode_tags: ["open-eye"],
    viewing_mode_confidence: "high",
    viewing_mode_review_required: false,
    title_drugs: [],
    title_class_mentions: [],
    drug_classes: [],
    content_family: "experiential-replication",
    content_tags: [],
    content_family_confidence: "high",
    content_family_review_required: false,
    taxonomy_review_required: false,
    taxonomy_version: 1,
    taxonomy_source_digest: SHA,
    taxonomy_updated_at: 1,
    ...overrides,
  };
}

function taxonomyEvidence() {
  return {
    operation_id: "campaign:catalog-1",
    replication_status_rationale: "Reviewed as a replication.",
    viewing_mode_rationale: "Recognizable real-world substrate.",
    content_family_rationale: "Reviewed experiential replication.",
  };
}

function args(
  overrides: Partial<InsertMediaAssetArgs> = {},
): InsertMediaAssetArgs {
  return {
    expected_absent: true,
    slug: "r2-only-replication",
    title: "R2-only replication",
    artist: "Archive Artist",
    role: "replication",
    type: "image",
    r2_key: R2_KEY,
    effect_tags: [],
    format: "webp",
    rights_status: "unknown",
    ...overrides,
  } as InsertMediaAssetArgs;
}

function mutationContext(options: {
  rows?: Record<string, unknown>[];
  taxonomyEvidenceRows?: Record<string, unknown>[];
  identityRole?: "admin" | "editor" | "viewer";
} = {}) {
  const rows = options.rows ?? [];
  const insert = vi.fn(async (
    table: string,
    _row: Record<string, unknown>,
  ) => table === "replications" ? "replication-id" : "evidence-id");
  const query = vi.fn((table: string) => ({
    withIndex: (_index: string, apply: (query: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
      const clauses: Array<[string, unknown]> = [];
      const indexQuery = {
        eq(nextField: string, nextValue: unknown) {
          clauses.push([nextField, nextValue]);
          return this;
        },
      };
      apply(indexQuery);
      const tableRows = table === "replications"
        ? rows
        : table === "replicationTaxonomyEvidence"
          ? options.taxonomyEvidenceRows ?? []
          : table === "memberships"
            ? [{ email: "editor@example.com", role: options.identityRole ?? "editor" }]
            : [];
      const match = () => tableRows.find(
        (row) => clauses.every(([field, value]) => row[field] === value),
      ) ?? null;
      return {
        first: async () => match(),
        unique: async () => match(),
      };
    },
  }));

  const ctx = {
    auth: {
      getUserIdentity: async () => ({
        subject: "editor",
        email: "editor@example.com",
        name: "Editor",
      }),
    },
    db: { insert, query },
  } as unknown as MutationCtx;

  return { ctx, insert, query };
}

describe("insertMediaAssetHandler", () => {
  it("inserts an R2-only replication without a fake Convex storage id", async () => {
    const { ctx, insert } = mutationContext();
    const input = args({
      thumbnail_r2_key: R2_KEY,
      preview_r2_key: R2_KEY,
      motion_r2_key: R2_KEY,
      motion_poster_r2_key: R2_KEY,
    });

    await expect(insertMediaAssetHandler(ctx, input)).resolves.toMatchObject({
      inserted: true,
      id: "replication-id",
      slug: "r2-only-replication",
    });
    const inserted = insert.mock.calls[0]?.[1];
    expect(inserted).toMatchObject({
      r2_key: R2_KEY,
      thumbnail_r2_key: R2_KEY,
      preview_r2_key: R2_KEY,
      motion_r2_key: R2_KEY,
      motion_poster_r2_key: R2_KEY,
    });
    expect(inserted).not.toHaveProperty("storage_id");
    expect(inserted).not.toHaveProperty("expected_absent");
  });

  it("rejects an asset with no real media locator", async () => {
    const { ctx, insert } = mutationContext();

    await expect(
      insertMediaAssetHandler(ctx, args({ r2_key: undefined })),
    ).rejects.toThrow(/no real r2_key, storage_id, or url/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a non-canonical R2 key even when another locator is present", async () => {
    const { ctx, insert } = mutationContext();

    await expect(
      insertMediaAssetHandler(
        ctx,
        args({
          r2_key: `media/sha256/ff/${SHA}.webp`,
          storage_id: "native-storage-id",
        }),
      ),
    ).rejects.toThrow(/invalid r2_key/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("validates every R2 rendition key on insert", async () => {
    const { ctx, insert } = mutationContext();
    const input = {
      ...args(),
      thumbnail_r2_key: `media/sha256/ff/${SHA}.webp`,
    } as InsertMediaAssetArgs;

    await expect(insertMediaAssetHandler(ctx, input)).rejects.toThrow(
      /invalid thumbnail_r2_key/,
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("treats an exact retry as idempotent", async () => {
    const existing = {
      _id: "existing-id",
      _creationTime: 1,
      slug: "r2-only-replication",
      title: "R2-only replication",
      artist: "Archive Artist",
      role: "replication",
      type: "image",
      r2_key: R2_KEY,
      format: "webp",
      source_sha256: SHA,
      rights_status: "unknown",
      created_at: "2026-08-31T00:00:00.000Z",
    };
    const { ctx, insert } = mutationContext({ rows: [existing] });

    await expect(insertMediaAssetHandler(ctx, args({ source_sha256: SHA }))).resolves.toEqual({
      inserted: false,
      id: "existing-id",
      slug: "r2-only-replication",
      role: "replication",
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a slug collision when the existing row drifted", async () => {
    const { ctx, insert } = mutationContext({
      rows: [{
        _id: "other-id",
        slug: "r2-only-replication",
        title: "Different work",
        artist: "Another Artist",
        role: "replication",
        type: "image",
        r2_key: R2_KEY,
        format: "webp",
        rights_status: "unknown",
      }],
    });

    await expect(insertMediaAssetHandler(ctx, args())).rejects.toThrow(
      /slug already in use.*other-id/,
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a source catalog identity already claimed by another slug", async () => {
    const { ctx, insert } = mutationContext({
      rows: [{
        _id: "claimed-id",
        slug: "already-imported",
        source_catalog_id: "catalog-1",
      }],
    });
    const input = {
      ...args(),
      taxonomy: taxonomy(),
      taxonomy_evidence: taxonomyEvidence(),
    } as InsertMediaAssetArgs;

    await expect(insertMediaAssetHandler(ctx, input)).rejects.toThrow(
      /Catalog ID catalog-1 is already attached to already-imported/,
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a duplicate source SHA unless it is the exact slug retry", async () => {
    const { ctx, insert } = mutationContext({
      rows: [{
        _id: "sha-owner",
        slug: "already-imported",
        source_sha256: SHA,
      }],
    });

    await expect(
      insertMediaAssetHandler(ctx, args({ source_sha256: SHA })),
    ).rejects.toThrow(/Source SHA-256 .* is already attached to already-imported/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("flattens a coherent reviewed taxonomy and source digest into the row", async () => {
    const { ctx, insert } = mutationContext();
    const input = {
      ...args({ source_sha256: SHA }),
      taxonomy: taxonomy(),
      taxonomy_evidence: taxonomyEvidence(),
    } as InsertMediaAssetArgs;

    await expect(insertMediaAssetHandler(ctx, input)).resolves.toMatchObject({
      inserted: true,
    });
    const inserted = insert.mock.calls[0]?.[1];
    expect(inserted).toMatchObject({
      source_sha256: SHA,
      source_catalog_id: "catalog-1",
      taxonomy_record_key: "catalog:catalog-1",
      replication_status: "replication",
      viewing_mode: "open-eye",
      content_family: "experiential-replication",
      taxonomy_source_digest: SHA,
    });
    expect(inserted).not.toHaveProperty("taxonomy");
    expect(insert).toHaveBeenNthCalledWith(
      2,
      "replicationTaxonomyEvidence",
      expect.objectContaining({
        replication_id: "replication-id",
        taxonomy_record_key: "catalog:catalog-1",
        taxonomy_source_digest: SHA,
        operation_id: "campaign:catalog-1",
      }),
    );
  });

  it("requires an evidence trail whenever reviewed taxonomy is inserted", async () => {
    const { ctx, insert } = mutationContext();
    const input = {
      ...args(),
      taxonomy: taxonomy(),
    } as InsertMediaAssetArgs;

    await expect(insertMediaAssetHandler(ctx, input)).rejects.toThrow(
      /taxonomy_evidence/,
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a depicted effect tag that does not exist", async () => {
    const { ctx, insert } = mutationContext();

    await expect(
      insertMediaAssetHandler(ctx, args({ effect_tags: ["missing-effect"] })),
    ).rejects.toThrow(/effect does not exist: missing-effect/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects explicit-license rights without the license evidence", async () => {
    const { ctx, insert } = mutationContext();

    await expect(
      insertMediaAssetHandler(ctx, args({ rights_status: "explicit-license" })),
    ).rejects.toThrow(/explicit-license rights need license_name and license_url/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects public-domain rights without a source and evidence note", async () => {
    const { ctx, insert } = mutationContext();

    await expect(
      insertMediaAssetHandler(ctx, args({ rights_status: "public-domain" })),
    ).rejects.toThrow(/public-domain rights need source_url and permission_notes/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("routes the legacy insert through the guarded contract", async () => {
    const { ctx, insert } = mutationContext();

    await expect(insertReplicationHandler(ctx, {
      slug: "Not Kebab Case",
      title: "Legacy row",
      artist: "Archive Artist",
      type: "image",
      storage_id: "native-storage-id",
      effect_slug: "drifting",
      format: "webp",
    })).rejects.toThrow(/slug is not kebab-case/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects an authenticated viewer before evaluating insert data", async () => {
    const { ctx, insert } = mutationContext({ identityRole: "viewer" });

    await expect(insertMediaAssetHandler(ctx, args())).rejects.toThrow(
      /Editor access required/,
    );
    expect(insert).not.toHaveBeenCalled();
  });
});
