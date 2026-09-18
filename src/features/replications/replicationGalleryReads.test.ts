import { describe, expect, it } from "vitest";

import type { QueryCtx } from "@server/postgres/runtime/server";
import { PostgresDatabaseReader } from "../../../lib/postgres/runtime/db";
import type { SqlExecutor } from "../../../lib/postgres/runtime/db";
import {
  clampPublicGalleryPageSize,
  getPublicGalleryPageHandler,
} from "../../../server/lib/replicationGalleryReads";

describe("public replication gallery pagination", () => {
  it("hard-caps every requested page to 64 rows", () => {
    expect(clampPublicGalleryPageSize(10_000)).toBe(64);
    expect(clampPublicGalleryPageSize(32)).toBe(32);
    expect(clampPublicGalleryPageSize(0)).toBe(1);
  });

  it("returns one slim publishable page and advances the opaque Postgres cursor", async () => {
    const paginate = vi.fn().mockResolvedValue({
      page: [
        {
          _id: "work-id",
          _creationTime: 1,
          slug: "work",
          title: "Work",
          artist: "Artist",
          type: "image",
          format: "webp",
          storage_id: "storage-work",
          created_at: "2026-01-01",
        },
        {
          _id: "figure-id",
          _creationTime: 2,
          slug: "figure",
          title: "Figure",
          artist: "Artist",
          role: "figure",
          type: "image",
          format: "webp",
          storage_id: "storage-figure",
          created_at: "2026-01-02",
        },
        {
          _id: "duplicate-id",
          _creationTime: 3,
          slug: "duplicate",
          title: "Duplicate",
          artist: "Artist",
          publication_state: "duplicate-suppressed",
          duplicate_of_replication_id: "work-id",
          type: "image",
          format: "webp",
          storage_id: "storage-duplicate",
          created_at: "2026-01-03",
        },
      ],
      continueCursor: "opaque-next",
      isDone: false,
    });
    const ctx = {
      db: {
        query: vi.fn(() => ({ paginate })),
      },
      storage: {
        getUrl: vi.fn(async (storageId: string) => `https://media.example/${storageId}`),
      },
    } as unknown as QueryCtx;

    await expect(
      getPublicGalleryPageHandler(ctx, { cursor: "opaque-current", limit: 5_000 }),
    ).resolves.toEqual({
      items: [
        {
          _id: "work-id",
          slug: "work",
          title: "Work",
          artist: "Artist",
          type: "image",
          format: "webp",
          url: "https://media.example/storage-work",
          created_at: "2026-01-01",
        },
      ],
      cursor: "opaque-next",
      isDone: false,
    });
    expect(paginate).toHaveBeenCalledWith({
      cursor: "opaque-current",
      numItems: 64,
    });
  });

  it("keeps effect-visible works regardless of artist display policy and withholds unavailable media", async () => {
    const work = (slug: string, overrides = {}) => ({
      _id: slug, _creationTime: 1, slug, title: slug, artist: "Excluded Artist",
      type: "image", format: "webp", storage_id: slug, created_at: "2026-01-01",
      effect_slug: "drifting", ...overrides,
    });
    const ctx = {
      db: {
        getPublicEffectReplicationPage: async () => ({
          page: [
            work("owner"), work("tagged", { effect_slug: "geometry", effect_tags: ["drifting"] }),
            work("figure", { role: "figure" }),
            work("suppressed", { publication_state: "duplicate-suppressed" }),
            work("non-replication", { replication_status: "not-replication" }),
            work("unsupported", { type: "document" }), work("missing-media"),
          ],
          continueCursor: "scoped-next", isDone: false,
        }),
        getPublicEffectGalleryOrders: async () => [
          { slug: "drifting", gallery_order: ["tagged", "owner"] },
          { slug: "geometry", gallery_order: ["tagged"] },
        ],
      },
      storage: {
        getUrl: async (id: string) => id === "missing-media" ? null : `https://media.example/${id}`,
      },
    } as unknown as QueryCtx;
    const result = await getPublicGalleryPageHandler(ctx, { limit: 64, effectSlug: "drifting" });
    expect(result.items.map((item) => item.slug)).toEqual(["owner", "tagged"]);
    expect(result.items.map((item) => item.effect_order_index?.drifting)).toEqual([1, 0]);
    expect(result.isDone).toBe(false);
  });

  it("rejects effect cursors in the unfiltered gallery before reading any rows", async () => {
    const ctx = {
      db: { query: () => { throw new Error("Unexpected unfiltered query"); } },
    } as unknown as QueryCtx;
    await expect(getPublicGalleryPageHandler(ctx, {
      limit: 64,
      cursor: 'effect-replications:{"effectSlug":"drifting","_creationTime":1,"_id":"work"}',
    })).rejects.toThrow("Invalid effect replication cursor.");
  });

  it("binds native continuation to the exact effect and rejects malformed or foreign cursors", async () => {
    const reader = new PostgresDatabaseReader({
      statements: 0,
      query: async () => ({
        rows: [
          { _id: "owner", _creationTime: 1, slug: "owner", effect_slug: "drifting" },
          { _id: "tagged", _creationTime: 1, slug: "tagged", effect_tags: '["drifting"]' },
          { _id: "tail", _creationTime: 2, slug: "tail", effect_slug: "drifting" },
        ],
        rowCount: 3,
      }),
    } as SqlExecutor, new Map());
    const page = await reader.getPublicEffectReplicationPage({ effectSlug: "drifting", limit: 2 });
    expect(page.page.map((item) => item.slug)).toEqual(["owner", "tagged"]);
    expect(page.isDone).toBe(false);
    const rejectingReader = new PostgresDatabaseReader({
      statements: 0,
      query: async () => { throw new Error("Invalid cursors must not reach SQL"); },
    } as SqlExecutor, new Map());
    for (const effectSlug of ["geometry", "Drifting", " drifting"]) {
      await expect(rejectingReader.getPublicEffectReplicationPage({
        effectSlug, cursor: page.continueCursor, limit: 2,
      })).rejects.toThrow("Invalid effect replication cursor.");
    }
    for (const cursor of [
      '{"_creationTime":1,"_id":"owner"}',
      "effect-replications:not-json",
      'effect-replications:{"effectSlug":"drifting","_creationTime":null,"_id":"owner"}',
      'effect-replications:{"effectSlug":"drifting","_creationTime":1,"_id":""}',
    ]) {
      await expect(rejectingReader.getPublicEffectReplicationPage({
        effectSlug: "drifting", cursor, limit: 2,
      })).rejects.toThrow("Invalid effect replication cursor.");
    }
  });
});
