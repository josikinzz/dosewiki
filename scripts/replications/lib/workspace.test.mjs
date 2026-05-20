import path from "path";
import { describe, expect, it, vi } from "vitest";
import {
  canonicalizeEffectSlug,
  dedupePreserveOrder,
} from "./reconciliation.mjs";
import {
  createConvexReplicationMediaAdapter,
  deriveGalleryOrderFromMetadata,
  planGalleryOrderMutations,
  planReplicationMediaChanges,
  reconcileReplicationMetadata,
  scanSourceMedia,
} from "./workspace.mjs";

describe("replication media reconciliation workspace", () => {
  it("canonicalizes legacy effect slugs", () => {
    expect(canonicalizeEffectSlug("visual-drifting")).toBe("drifting");
    expect(canonicalizeEffectSlug("color-modulation")).toBe("colour-shifting");
    expect(canonicalizeEffectSlug("geometry")).toBe("geometry");
    expect(canonicalizeEffectSlug(null)).toBeNull();
  });

  it("applies gallery mappings and replication-specific overrides without mutating input", () => {
    const replications = [
      { slug: "alpha-unknown", effect_slug: "visual-drifting" },
      { slug: "hatmancometh-unknown", effect_slug: null },
    ];
    const galleryOrderMapping = new Map([["colour-shifting", ["alpha-unknown"]]]);

    const result = reconcileReplicationMetadata(replications, galleryOrderMapping);

    expect(result.replications).toEqual([
      { slug: "alpha-unknown", effect_slug: "colour-shifting" },
      { slug: "hatmancometh-unknown", effect_slug: "shadow-people" },
    ]);
    expect(replications[0].effect_slug).toBe("visual-drifting");
  });

  it("dedupes gallery order while preserving first occurrence order", () => {
    expect(dedupePreserveOrder(["one", "two", "one", "", "three", "two"])).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("derives gallery order from mappings followed by reconciled metadata", () => {
    const galleryOrder = deriveGalleryOrderFromMetadata(
      [
        { slug: "late", effect_slug: "drifting" },
        { slug: "mapped", effect_slug: "drifting" },
        { slug: "legacy", effect_slug: "visual-drifting" },
      ],
      new Map([["drifting", ["mapped", "mapped"]]]),
    );

    expect(galleryOrder.get("drifting")).toEqual(["mapped", "late", "legacy"]);
  });
});

describe("replication media scanner", () => {
  it("scans a synthetic media tree with images, videos, missing artists, and legacy folders", () => {
    const videosDir = "/root/videos/new";
    const imagesDir = "/root/images";
    const directories = new Set([videosDir, path.posix.join(videosDir, "visual flowing")]);
    const fsAdapter = {
      readdirSync: vi.fn((dir) => {
        if (dir === videosDir) {
          return ["visual flowing"];
        }
        if (dir === path.posix.join(videosDir, "visual flowing")) {
          return ["Breathing Wall by Alice.mp4", "Ignore.txt"];
        }
        if (dir === imagesDir) {
          return ["Untitled.png", "Texture by Bea.webp", "notes.md"];
        }
        return [];
      }),
      statSync: vi.fn((filePath) => ({
        isDirectory: () => directories.has(filePath),
      })),
    };

    const output = scanSourceMedia({
      videosDir,
      imagesDir,
      fsAdapter,
      pathAdapter: path.posix,
      getFileInfo: (filePath, isVideo) =>
        isVideo ? { width: 640, height: 480, duration: 1.5, fileSize: 100 } : { width: 200, height: 100, fileSize: 10 },
    });

    expect(output.metadata).toMatchObject({
      totalReplications: 3,
      videoCount: 1,
      imageCount: 2,
      videosWithEffectMapping: 1,
      imagesNeedingManualMapping: 2,
    });
    expect(output.replications).toEqual([
      expect.objectContaining({
        slug: "breathing-wall-alice",
        artist: "Alice",
        type: "video",
        effect_slug: "drifting",
        format: "mp4",
        duration: 1.5,
      }),
      expect.objectContaining({
        slug: "texture-bea",
        artist: "Bea",
        type: "image",
        effect_slug: null,
        format: "webp",
      }),
      expect.objectContaining({
        slug: "untitled-unknown",
        artist: "Unknown",
        type: "image",
        effect_slug: null,
        format: "png",
      }),
    ]);
  });
});

describe("replication media planning", () => {
  it("plans gallery updates, legacy-only mappings, and stale gallery clearing", () => {
    const plan = planGalleryOrderMutations({
      replications: [
        { slug: "one", effect_slug: "visual-drifting" },
        { slug: "two", effect_slug: "missing-effect" },
      ],
      currentEffects: [
        { slug: "drifting", gallery_order: [] },
        { slug: "stale", gallery_order: ["old"] },
      ],
    });

    expect(plan.effects).toEqual([["drifting", ["one"]]]);
    expect(plan.legacyOnlyEffects).toEqual(["missing-effect"]);
    expect(plan.staleEffects).toEqual(["stale"]);
  });

  it("compares desired metadata against current Convex records", () => {
    const plan = planReplicationMediaChanges({
      desiredReplications: [
        { slug: "create-me", title: "Create", artist: "A", type: "image", effect_slug: "drifting", format: "png" },
        { slug: "update-me", title: "Updated", artist: "B", type: "video", effect_slug: "visual-drifting", format: "mp4" },
        { slug: "noop", title: "Same", artist: "C", type: "image", effect_slug: "geometry", format: "jpg" },
      ],
      currentReplications: [
        {
          _id: "rep-1",
          slug: "update-me",
          title: "Old",
          artist: "B",
          type: "video",
          effect_slug: "old-effect",
          format: "mp4",
          storage_id: "placeholder-video",
        },
        {
          _id: "rep-2",
          slug: "noop",
          title: "Same",
          artist: "C",
          type: "image",
          effect_slug: "geometry",
          format: "jpg",
          storage_id: "storage-ok",
        },
      ],
      currentEffects: [
        { slug: "drifting", gallery_order: [] },
        { slug: "geometry", gallery_order: [] },
        { slug: "stale", gallery_order: ["old"] },
      ],
    });

    expect(plan.create.map((replication) => replication.slug)).toEqual(["create-me"]);
    expect(plan.update).toEqual([
      {
        slug: "update-me",
        id: "rep-1",
        changes: {
          title: { from: "Old", to: "Updated" },
          effect_slug: { from: "old-effect", to: "drifting" },
        },
      },
    ]);
    expect(plan.upload).toEqual([
      { slug: "create-me", reason: "missing-storage" },
      { slug: "update-me", reason: "placeholder-storage" },
    ]);
    expect(plan.staleGallery).toEqual(["stale"]);
    expect(plan.noop).toEqual(["noop"]);
  });
});

describe("replication media Convex adapter", () => {
  it("wraps Convex mutations and upload responses", async () => {
    const client = {
      mutation: vi.fn(async (_mutation, args) => ({ mutation: _mutation, args })),
    };
    const api = {
      replications: {
        generateUploadUrl: "generateUploadUrl",
        insertReplication: "insertReplication",
        updateEffectSlug: "updateEffectSlug",
        updateGalleryOrder: "updateGalleryOrder",
        updateStorageIds: "updateStorageIds",
      },
      subjectiveEffects: {
        update: "updateSubjectiveEffect",
      },
    };
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ storageId: "storage-123" }),
    }));
    const adapter = createConvexReplicationMediaAdapter({
      client,
      api,
      apiKey: "admin-key",
      fetchFn,
    });

    await expect(adapter.generateUploadUrl()).resolves.toMatchObject({
      mutation: "generateUploadUrl",
      args: { apiKey: "admin-key" },
    });
    await expect(adapter.uploadBuffer("https://upload.example", Buffer.from("x"), "image/png")).resolves.toBe(
      "storage-123",
    );
    await adapter.insertReplication({ slug: "one", storage_id: "storage-1" });
    await adapter.updateStorageIds({ id: "rep-1", storage_id: "storage-2" });
    await adapter.updateEffectSlug({ slug: "one", effect_slug: "drifting" });
    await adapter.updateGalleryOrder({ effect_slug: "drifting", replication_slugs: ["one"] });
    await adapter.clearGalleryOrder("stale");

    expect(client.mutation).toHaveBeenCalledWith("insertReplication", {
      apiKey: "admin-key",
      slug: "one",
      storage_id: "storage-1",
    });
    expect(client.mutation).toHaveBeenCalledWith("updateStorageIds", {
      apiKey: "admin-key",
      id: "rep-1",
      storage_id: "storage-2",
      thumbnail_storage_id: undefined,
    });
    expect(client.mutation).toHaveBeenCalledWith("updateEffectSlug", {
      apiKey: "admin-key",
      slug: "one",
      effect_slug: "drifting",
    });
    expect(client.mutation).toHaveBeenCalledWith("updateGalleryOrder", {
      apiKey: "admin-key",
      effect_slug: "drifting",
      replication_slugs: ["one"],
    });
    expect(client.mutation).toHaveBeenCalledWith("updateSubjectiveEffect", {
      apiKey: "admin-key",
      slug: "stale",
      updates: { gallery_order: [] },
    });
    expect(fetchFn).toHaveBeenCalledWith("https://upload.example", {
      method: "POST",
      body: Buffer.from("x"),
      headers: { "Content-Type": "image/png" },
    });
  });
});
