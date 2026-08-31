import { describe, expect, it } from "vitest";

import type { QueryCtx } from "../../../convex/_generated/server";
import {
  clampPublicGalleryPageSize,
  getPublicGalleryPageHandler,
} from "../../../convex/lib/replicationGalleryReads";

describe("public replication gallery pagination", () => {
  it("hard-caps every requested page to 64 rows", () => {
    expect(clampPublicGalleryPageSize(10_000)).toBe(64);
    expect(clampPublicGalleryPageSize(32)).toBe(32);
    expect(clampPublicGalleryPageSize(0)).toBe(1);
  });

  it("returns one slim publishable page and advances the opaque Convex cursor", async () => {
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
});
