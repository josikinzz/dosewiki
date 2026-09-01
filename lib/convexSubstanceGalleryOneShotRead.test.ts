import { describe, expect, it, vi } from "vitest";
import type { Doc } from "../convex/_generated/dataModel";
import type { QueryCtx } from "../convex/_generated/server";
import { getPublicGalleryBySubstanceHandler } from "../convex/lib/substanceGalleryPublicReads";

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
  gallery?: { curated_slugs: string[]; removed_slugs: string[]; carousel_order?: string[] } | null;
  substances?: unknown[];
  storageUrls?: Record<string, string>;
}) {
  const collect = vi.fn(async () => options.rows);
  const paginate = vi.fn(() => {
    throw new Error("the one-shot gallery read must not paginate");
  });
  const getUrl = vi.fn(async (storageId: string) => options.storageUrls?.[storageId] ?? null);
  const query = vi.fn((table: string) => {
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
    if (table === "replications") return { collect, paginate };
    throw new Error(`Unexpected table ${table}`);
  });
  return {
    ctx: { db: { query }, storage: { getUrl } } as unknown as QueryCtx,
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
    expect(test.collect).toHaveBeenCalledTimes(1);

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
});
