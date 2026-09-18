import { describe, expect, it, vi } from "vitest";
import type { Doc } from "@server/postgres/runtime/dataModel";
import type { QueryCtx } from "@server/postgres/runtime/server";
import { getPublicGalleryBySubstanceHandler } from "../server/lib/substanceGalleryPublicReads";
import { galleryCandidateKeys, galleryMatchProjection } from "../server/lib/publicReadIndexes";

const ketamineDrug = {
  slug: "ketamine",
  name: "Ketamine",
  class: "dissociatives" as const,
  matched_title_text: "Ketamine",
};

function replication(
  slug: string,
  overrides: Partial<Doc<"replications">> = {},
): Doc<"replications"> {
  return {
    _id: `replication-${slug}` as Doc<"replications">["_id"],
    _creationTime: 1,
    slug,
    title: slug,
    artist: "Test artist",
    type: "image",
    format: "jpg",
    created_at: "2026-08-31T00:00:00.000Z",
    url: `https://media.example/${slug}.jpg`,
    ...overrides,
  };
}

function galleryContext(options: {
  rows: Doc<"replications">[];
  gallery?: { curated_slugs: string[]; removed_slugs: string[]; carousel_order?: string[]; disabled?: boolean } | null;
  substances?: unknown[];
  storageUrls?: Record<string, string>;
  ready?: boolean;
}) {
  const collect = vi.fn(() => { throw new Error("Public gallery must not scan heavy replication rows"); });
  const candidates = options.rows.flatMap((row, index) => galleryCandidateKeys(row).map((candidate_key) => ({
    ...galleryMatchProjection(row), candidate_key, replication_id: row._id, source_created: index,
  })));
  const getUrl = vi.fn(async (storageId: string) => options.storageUrls?.[storageId] ?? null);
  const query = vi.fn((table: string) => {
    if (table === "publicReadIndexState") {
      return { withIndex: () => ({ unique: async () => options.ready === false ? null : { version: 1, ready: true } }) };
    }
    if (table === "replicationGalleryCandidates") {
      return { withIndex: (_name: string, select: (q: unknown) => unknown) => {
        let key = "";
        select({ eq: (_field: string, value: string) => { key = value; } });
        return { collect: async () => candidates.filter((row) => row.candidate_key === key) };
      } };
    }
    if (table === "substanceIndex") {
      return {
        withIndex: () => ({
          take: async () =>
            options.substances ?? [
              {
                slug: "ketamine",
                title: "Ketamine",
                classification: { psychoactive_class: ["Dissociative"] },
              },
            ],
        }),
      };
    }
    if (table === "substanceGalleries") {
      return { withIndex: () => ({ first: async () => options.gallery ?? null }) };
    }
    if (table === "replications") return { collect };
    throw new Error(`Unexpected table ${table}`);
  });
  return {
    ctx: { db: { query, get: async (id: string) => options.rows.find((row) => row._id === id) ?? null }, storage: { getUrl } } as unknown as QueryCtx,
    collect,
    getUrl,
  };
}

describe("substanceGalleries:getPublicGalleryBySubstance", () => {
  it("returns the merged, ordered showcase with resolved URLs in one read", async () => {
    const specificVideo = replication("specific-video", {
      type: "video",
      format: "mp4",
      title_drugs: [ketamineDrug],
      url: undefined,
      storage_id: "storage-video",
      thumbnail_storage_id: "storage-video-thumb",
    });
    const specificImage = replication("specific-image", { title_drugs: [ketamineDrug] });
    const classImage = replication("class-general", {
      title_class_mentions: [{ class: "dissociatives", matched_title_text: "dissociative" }],
    });
    const direct = replication("direct");
    const suppressed = replication("suppressed", { title_drugs: [ketamineDrug] });
    const figure = replication("figure", { role: "figure", title_drugs: [ketamineDrug] });
    const irrelevant = replication("irrelevant");
    const unresolvable = replication("unresolvable", {
      title_drugs: [ketamineDrug],
      url: undefined,
      storage_id: "storage-missing",
    });

    const test = galleryContext({
      rows: [irrelevant, classImage, suppressed, specificImage, figure, direct, specificVideo, unresolvable],
      gallery: { curated_slugs: ["direct"], removed_slugs: ["suppressed"], carousel_order: [] },
      storageUrls: {
        "storage-video": "https://storage.example/video.mp4",
        "storage-video-thumb": "https://storage.example/video-thumb.jpg",
      },
    });

    const result = await getPublicGalleryBySubstanceHandler(test.ctx, { substance_slug: "ketamine" });

    expect(result.items.map((item) => item.replication.slug)).toEqual([
      "specific-video",
      "specific-image",
      "class-general",
      "direct",
    ]);
    expect(result.items.map((item) => item.provenance.matchedVia)).toEqual([
      "specific_drug",
      "specific_drug",
      "drug_class",
      "curated",
    ]);
    expect(test.collect).not.toHaveBeenCalled();

    // Same row contract as `replications:getBySlugs`: a resolved main URL is
    // required, renditions appear only when they resolved.
    const video = result.items[0].replication;
    expect(video.url).toBe("https://storage.example/video.mp4");
    expect(video.thumbnail_url).toBe("https://storage.example/video-thumb.jpg");
    expect(video).not.toHaveProperty("preview_url");
    expect(video).not.toHaveProperty("motion_url");
    const image = result.items[1].replication;
    expect(image.url).toBe("https://media.example/specific-image.jpg");
    expect(image).not.toHaveProperty("thumbnail_url");

    // Only merged winners pay storage resolution; the suppressed, irrelevant,
    // and figure rows never reach `storage.getUrl`.
    expect(test.getUrl.mock.calls.map(([id]) => id).sort()).toEqual([
      "storage-missing",
      "storage-video",
      "storage-video-thumb",
    ]);
  });

  it("honours the stored carousel order across tiers", async () => {
    const rows = [
      replication("video", { type: "video", format: "mp4", title_drugs: [ketamineDrug] }),
      replication("image", { title_drugs: [ketamineDrug] }),
      replication("direct"),
    ];
    const test = galleryContext({
      rows,
      gallery: { curated_slugs: ["direct"], removed_slugs: [], carousel_order: ["direct", "image"] },
    });

    const result = await getPublicGalleryBySubstanceHandler(test.ctx, { substance_slug: "ketamine" });

    expect(result.items.map((item) => item.replication.slug)).toEqual(["direct", "image", "video"]);
  });

  it("keeps a disabled gallery empty as specific, class, and fallback media grow", async () => {
    const test = galleryContext({
      rows: [
        replication("new-specific", { title_drugs: [ketamineDrug] }),
        replication("new-general", { title_class_mentions: [{ class: "dissociatives", matched_title_text: "Dissociative" }] }),
        replication("new-fallback", { effect_slug: "visual-disconnection" }),
        replication("direct"),
      ],
      gallery: { curated_slugs: ["direct"], removed_slugs: [], carousel_order: ["direct"], disabled: true },
      ready: false,
    });
    expect(await getPublicGalleryBySubstanceHandler(test.ctx, { substance_slug: "ketamine" })).toEqual({ items: [] });
  });

  it("is an empty gallery for a missing or ambiguous substance without scanning the corpus", async () => {
    const missing = galleryContext({ rows: [replication("x")], substances: [] });
    await expect(
      getPublicGalleryBySubstanceHandler(missing.ctx, { substance_slug: "nope" }),
    ).resolves.toEqual({ items: [] });
    expect(missing.collect).not.toHaveBeenCalled();

    const ambiguous = galleryContext({
      rows: [replication("x")],
      substances: [{ slug: "dup" }, { slug: "dup" }],
    });
    await expect(
      getPublicGalleryBySubstanceHandler(ambiguous.ctx, { substance_slug: "dup" }),
    ).resolves.toEqual({ items: [] });
    expect(ambiguous.collect).not.toHaveBeenCalled();
  });

  it("is an empty gallery, not an error, when nothing matches", async () => {
    const test = galleryContext({ rows: [replication("irrelevant")] });
    await expect(
      getPublicGalleryBySubstanceHandler(test.ctx, { substance_slug: "ketamine" }),
    ).resolves.toEqual({ items: [] });
    expect(test.getUrl).not.toHaveBeenCalled();
  });

  it("refuses a partially populated index instead of publishing an incomplete gallery", async () => {
    const test = galleryContext({ rows: [replication("specific", { title_drugs: [ketamineDrug] })], ready: false });
    await expect(getPublicGalleryBySubstanceHandler(test.ctx, { substance_slug: "ketamine" }))
      .rejects.toMatchObject({ data: { code: "SUBSTANCE_GALLERY_INDEX_NOT_READY" } });
  });

  it("honors title aliases, visual fallback and publication suppression through compact candidates", async () => {
    const test = galleryContext({ rows: [
      replication("title", { title: "Ketamine simulation" }),
      replication("visual", { effect_slug: "visual-disconnection" }),
      replication("suppressed", { title_drugs: [ketamineDrug], publication_state: "duplicate-suppressed" }),
    ], gallery: { curated_slugs: ["suppressed"], removed_slugs: [] } });
    const result = await getPublicGalleryBySubstanceHandler(test.ctx, { substance_slug: "ketamine" });
    expect(result.items.map((item) => item.replication.slug)).toEqual(["title", "visual"]);
  });
});
