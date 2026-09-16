import { describe, expect, it, vi } from "vitest";

import type { QueryCtx } from "@server/postgres/runtime/server";
import { getBySlugsHandler } from "../server/lib/replicationReads";
import { PostgresDatabaseReader } from "./postgres/runtime/db";

function row(slug: string) {
  return {
    _id: `id-${slug}`,
    _creationTime: 1,
    slug,
    title: slug,
    artist: "Artist",
    type: "image" as const,
    storage_id: `storage-${slug}`,
    format: "webp",
    created_at: "2026-01-01",
  };
}

describe("bounded public replication detail reads", () => {
  it("resolves a shortlist in one SQL query while preserving caller order and deduplication", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [row("one"), row("two")],
      rowCount: 2,
    });
    const ctx = {
      db: new PostgresDatabaseReader({ query, statements: 0 }, new Map()),
      storage: {
        getUrl: vi.fn(async (storageId: string) => `https://media.test/${storageId}`),
      },
    } as unknown as QueryCtx;

    await expect(
      getBySlugsHandler(ctx, { slugs: ["two", "one", "two", "missing"] }),
    ).resolves.toEqual([
      expect.objectContaining({ slug: "two", url: "https://media.test/storage-two" }),
      expect.objectContaining({ slug: "one", url: "https://media.test/storage-one" }),
    ]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([["two", "one", "missing"]]);
  });

  it("rejects an oversized slug batch before reading Postgres", async () => {
    const query = vi.fn();
    const ctx = { db: { getReplicationsBySlugs: query }, storage: {} } as unknown as QueryCtx;

    await expect(
      getBySlugsHandler(ctx, {
        slugs: Array.from({ length: 101 }, (_, index) => `slug-${index}`),
      }),
    ).rejects.toThrow("at most 100");
    expect(query).not.toHaveBeenCalled();
  });
});
