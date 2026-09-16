import { describe, expect, it, vi } from "vitest";

import type { QueryCtx } from "@server/postgres/runtime/server";
import { getByArtistNamesPageHandler } from "../server/lib/replicationReads";

function row(slug: string, artist: string) {
  return {
    _id: `id-${slug}`,
    _creationTime: 1,
    slug,
    title: slug,
    artist,
    type: "image" as const,
    storage_id: `storage-${slug}`,
    format: "webp",
    created_at: "2026-01-01",
  };
}

describe("bounded contributor replication reads", () => {
  it("scans at most 64 raw rows, matches normalized names, and preserves the page cursor", async () => {
    const paginate = vi.fn(async () => ({
      page: [
        row("first", "Josie Kins"),
        row("other", "Someone Else"),
        row("alias", " UNITY "),
        row("unknown", "Unknown"),
      ],
      continueCursor: "next-page",
      isDone: false,
    }));
    const ctx = {
      db: { query: vi.fn(() => ({ paginate })) },
      storage: {
        getUrl: vi.fn(async (storageId: string) => `https://media.test/${storageId}`),
      },
    } as unknown as QueryCtx;

    await expect(
      getByArtistNamesPageHandler(ctx, {
        artistNames: [" josie kins ", "unity", "unknown"],
        cursor: "current-page",
        limit: 999,
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          slug: "first",
          url: "https://media.test/storage-first",
        }),
        expect.objectContaining({
          slug: "alias",
          url: "https://media.test/storage-alias",
        }),
      ],
      cursor: "next-page",
      isDone: false,
    });
    expect(paginate).toHaveBeenCalledWith({
      cursor: "current-page",
      numItems: 64,
    });
    expect(ctx.storage.getUrl).toHaveBeenCalledTimes(2);
  });

  it("returns a terminal empty page without reading when no known artist name remains", async () => {
    const query = vi.fn();
    const ctx = { db: { query }, storage: {} } as unknown as QueryCtx;

    await expect(
      getByArtistNamesPageHandler(ctx, {
        artistNames: ["", "   ", "Unknown", "Anonymous"],
        cursor: "unused",
      }),
    ).resolves.toEqual({ items: [], cursor: "", isDone: true });
    expect(query).not.toHaveBeenCalled();
  });

  it("keeps a nonterminal cursor when a scanned page has no matching rows", async () => {
    const paginate = vi.fn(async () => ({
      page: [row("other", "Someone Else")],
      continueCursor: "keep-scanning",
      isDone: false,
    }));
    const ctx = {
      db: { query: vi.fn(() => ({ paginate })) },
      storage: { getUrl: vi.fn() },
    } as unknown as QueryCtx;

    await expect(
      getByArtistNamesPageHandler(ctx, { artistNames: ["Josie Kins"] }),
    ).resolves.toEqual({
      items: [],
      cursor: "keep-scanning",
      isDone: false,
    });
    expect(ctx.storage.getUrl).not.toHaveBeenCalled();
  });

  it("defaults each raw scan to 64 rows and clamps non-positive limits to one", async () => {
    const paginate = vi.fn(async () => ({
      page: [],
      continueCursor: "done",
      isDone: true,
    }));
    const ctx = {
      db: { query: vi.fn(() => ({ paginate })) },
      storage: { getUrl: vi.fn() },
    } as unknown as QueryCtx;

    await getByArtistNamesPageHandler(ctx, { artistNames: ["Artist"] });
    await getByArtistNamesPageHandler(ctx, {
      artistNames: ["Artist"],
      limit: 0,
    });

    expect(paginate).toHaveBeenNthCalledWith(1, {
      cursor: null,
      numItems: 64,
    });
    expect(paginate).toHaveBeenNthCalledWith(2, {
      cursor: null,
      numItems: 1,
    });
  });
});
