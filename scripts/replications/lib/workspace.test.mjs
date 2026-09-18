import path from "path";
import { describe, expect, it } from "vitest";
import {
  canonicalizeEffectSlug,
  dedupePreserveOrder,
} from "./reconciliation.mjs";
import {
  DEFAULT_REPLICATION_PERMISSION_NOTES,
  DEFAULT_REPLICATION_REMOVAL_CONTACT,
  deriveGalleryOrderFromMetadata,
  enrichReplicationMetadataFromEffectIndexDump,
  planGalleryOrderMutations,
  planReplicationMediaChanges,
  reconcileReplicationMetadata,
  scanSourceMedia,
  withDefaultReplicationRights,
} from "./workspace.mjs";

function defaultRightsFor(title, artist) {
  const { title: _title, artist: _artist, ...rights } = withDefaultReplicationRights({ title, artist });
  return rights;
}

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
      expect.objectContaining({
        slug: "alpha-unknown",
        effect_slug: "colour-shifting",
        rights_status: "creator-retained",
      }),
      expect.objectContaining({
        slug: "hatmancometh-unknown",
        effect_slug: "shadow-people",
        rights_status: "creator-retained",
      }),
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
        credit_line: "Breathing Wall by Alice",
        rightsholder: "Alice",
        rights_status: "creator-retained",
        type: "video",
        effect_slug: "drifting",
        format: "mp4",
        duration: 1.5,
      }),
      expect.objectContaining({
        slug: "texture-bea",
        artist: "Bea",
        credit_line: "Texture by Bea",
        rightsholder: "Bea",
        rights_status: "creator-retained",
        type: "image",
        effect_slug: null,
        format: "webp",
      }),
      expect.objectContaining({
        slug: "untitled-unknown",
        artist: "Unknown",
        credit_line: "Untitled (creator unknown)",
        rights_status: "creator-retained",
        type: "image",
        effect_slug: null,
        format: "png",
      }),
    ]);
  });

  it("enriches generated metadata from the EffectIndex replication dump without changing slugs", () => {
    const result = enrichReplicationMetadataFromEffectIndexDump(
      [
        {
          slug: "10376-12927-25985-unknown",
          title: "10376-12927-25985",
          artist: "Unknown",
          filename: "10376-12927-25985.jpg",
          type: "image",
        },
      ],
      [
        {
          title: "LSD field",
          artist: "/u/areponaf",
          artist_url: "https://reddit.com/u/areponaf",
          resource: "https://cdn.example/10376-12927-25985.jpg",
        },
      ],
    );

    expect(result.stats).toMatchObject({
      matched: 1,
      artistUpdated: 1,
      titleUpdated: 1,
      artistUrlAdded: 1,
      sourceUrlAdded: 1,
      defaultRightsAdded: 1,
    });
    expect(result.replications).toEqual([
      expect.objectContaining({
        slug: "10376-12927-25985-unknown",
        title: "LSD field",
        artist: "/u/areponaf",
        artist_url: "https://reddit.com/u/areponaf",
        source_url: "https://cdn.example/10376-12927-25985.jpg",
        rightsholder: "/u/areponaf",
        credit_line: "LSD field by /u/areponaf",
        rights_status: "creator-retained",
        permission_notes: DEFAULT_REPLICATION_PERMISSION_NOTES,
        removal_contact: DEFAULT_REPLICATION_REMOVAL_CONTACT,
      }),
    ]);
  });

  it("keeps explicit rights metadata when applying defaults", () => {
    expect(
      withDefaultReplicationRights({
        title: "Tone",
        artist: "Creator",
        rights_status: "explicit-license",
        license_name: "CC BY 4.0",
        credit_line: "Custom credit",
      }),
    ).toMatchObject({
      rights_status: "explicit-license",
      license_name: "CC BY 4.0",
      credit_line: "Custom credit",
      rightsholder: "Creator",
    });
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

  it("compares desired metadata against current Postgres records", () => {
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
          ...defaultRightsFor("Updated", "B"),
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
          ...defaultRightsFor("Same", "C"),
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

