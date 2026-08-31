import { describe, expect, it, vi } from "vitest";

import type { QueryCtx } from "../convex/_generated/server";
import { getBySlugsHandler } from "../convex/lib/replicationReads";

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
  it("resolves at most 100 indexed slugs in request order and deduplicates them", async () => {
    const rows = new Map([
      ["one", row("one")],
      ["two", row("two")],
    ]);
    const eq = vi.fn((_field: string, slug: string) => ({ slug }));
    const first = vi.fn(async function (this: { slug: string }) {
      return rows.get(this.slug) ?? null;
    });
    const withIndex = vi.fn((_name: string, build: (query: { eq: typeof eq }) => { slug: string }) => {
      const selected = build({ eq });
      return { first: first.bind(selected) };
    });
    const ctx = {
      db: { query: vi.fn(() => ({ withIndex })) },
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
    expect(withIndex).toHaveBeenCalledTimes(3);
    expect(withIndex).toHaveBeenCalledWith("by_slug", expect.any(Function));
  });

  it("rejects an oversized slug batch before reading Convex", async () => {
    const query = vi.fn();
    const ctx = { db: { query }, storage: {} } as unknown as QueryCtx;

    await expect(
      getBySlugsHandler(ctx, {
        slugs: Array.from({ length: 101 }, (_, index) => `slug-${index}`),
      }),
    ).rejects.toThrow("at most 100");
    expect(query).not.toHaveBeenCalled();
  });
});
