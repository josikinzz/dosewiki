import { describe, expect, it, vi } from "vitest";
import type { Doc } from "@server/postgres/runtime/dataModel";
import type { QueryCtx } from "@server/postgres/runtime/server";
import {
  clampPublicSubstanceGalleryPageSize,
  getPublicMatchableReplicationsPageHandler,
  getPublicReplicationsForSubstancePageHandler,
} from "../server/substanceGalleries";
import { mergeCuratedGallery } from "../src/data/substanceReplicationGallery";

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

type ReplicationPage = {
  page: Doc<"replications">[];
  continueCursor: string;
  isDone: boolean;
};

function galleryContext(options: {
  pages: Map<string | null, ReplicationPage>;
  gallery?: {
    curated_slugs: string[];
    removed_slugs: string[];
    carousel_order?: string[];
  } | null;
  substance?: unknown;
}) {
  const collect = vi.fn(() => {
    throw new Error("public substance gallery must not collect the corpus");
  });
  const paginate = vi.fn(async ({ cursor }: { cursor: string | null; numItems: number }) => {
    const page = options.pages.get(cursor);
    if (!page) throw new Error(`No test page for cursor ${String(cursor)}`);
    return page;
  });
  const query = vi.fn((table: string) => {
    if (table === "substanceIndex") {
      return {
        withIndex: () => ({
          take: async () => [
            options.substance ?? {
              slug: "ketamine",
              title: "Ketamine",
              classification: { psychoactive_class: ["Dissociative"] },
            },
          ],
        }),
      };
    }
    if (table === "substanceGalleries") {
      return {
        withIndex: () => ({ first: async () => options.gallery ?? null }),
      };
    }
    if (table === "replications") return { collect, paginate };
    throw new Error(`Unexpected table ${table}`);
  });

  return {
    ctx: {
      db: { query },
      storage: { getUrl: vi.fn(async () => null) },
    } as unknown as QueryCtx,
    collect,
    paginate,
    query,
  };
}

describe("public substance gallery pagination", () => {
  it("clamps every raw replication page to the 64-row ceiling", () => {
    expect(clampPublicSubstanceGalleryPageSize()).toBe(64);
    expect(clampPublicSubstanceGalleryPageSize(Number.NaN)).toBe(64);
    expect(clampPublicSubstanceGalleryPageSize(Number.POSITIVE_INFINITY)).toBe(64);
    expect(clampPublicSubstanceGalleryPageSize(-8)).toBe(1);
    expect(clampPublicSubstanceGalleryPageSize(17.9)).toBe(17);
    expect(clampPublicSubstanceGalleryPageSize(100)).toBe(64);
  });

  it("keeps sparse pages and the opaque cursor continuous without collect", async () => {
    const specific = replication("specific", {
      type: "video",
      format: "mp4",
      title_drugs: [
        {
          slug: "ketamine",
          name: "Ketamine",
          class: "dissociatives",
          matched_title_text: "Ketamine",
        },
      ],
    });
    const irrelevant = replication("irrelevant");
    const direct = replication("direct");
    const figure = replication("figure", {
      role: "figure",
      title_drugs: [
        {
          slug: "ketamine",
          name: "Ketamine",
          class: "dissociatives",
          matched_title_text: "Ketamine",
        },
      ],
    });
    const first = galleryContext({
      pages: new Map([
        [
          null,
          {
            page: [specific, irrelevant, direct, figure],
            continueCursor: "opaque-page-2",
            isDone: false,
          },
        ],
        [
          "opaque-page-2",
          { page: [], continueCursor: "opaque-done", isDone: true },
        ],
      ]),
      gallery: {
        curated_slugs: ["direct"],
        removed_slugs: [],
        carousel_order: ["direct"],
      },
    });

    const pageOne = await getPublicReplicationsForSubstancePageHandler(
      first.ctx,
      { substance_slug: "ketamine", limit: 100 },
    );
    expect(pageOne.items.map((item) => item.replication.slug)).toEqual([
      "specific",
      "direct",
    ]);
    expect(pageOne.cursor).toBe("opaque-page-2");
    expect(pageOne.isDone).toBe(false);
    expect(pageOne.curation).toMatchObject({
      curated_slugs: ["direct"],
      removed_slugs: [],
      carousel_order: ["direct"],
    });
    expect(first.paginate).toHaveBeenNthCalledWith(1, {
      cursor: null,
      numItems: 64,
    });

    const pageTwo = await getPublicReplicationsForSubstancePageHandler(
      first.ctx,
      {
        substance_slug: "ketamine",
        cursor: pageOne.cursor,
        limit: 100,
      },
    );
    expect(pageTwo).toMatchObject({
      items: [],
      cursor: "opaque-done",
      isDone: true,
    });
    expect(first.paginate).toHaveBeenNthCalledWith(2, {
      cursor: "opaque-page-2",
      numItems: 64,
    });
    expect(first.collect).not.toHaveBeenCalled();
  });

  it("can be drained and globally merged into the historical showcase order", async () => {
    const pageOneRows = [
      replication("specific-image", {
        title_drugs: [
          {
            slug: "ketamine",
            name: "Ketamine",
            class: "dissociatives",
            matched_title_text: "Ketamine",
          },
        ],
      }),
      replication("class-video", {
        type: "video",
        format: "mp4",
        title_class_mentions: [
          { class: "dissociatives", matched_title_text: "dissociative" },
        ],
      }),
      replication("noise"),
    ];
    const pageTwoRows = [
      replication("specific-video", {
        type: "video",
        format: "mp4",
        title_drugs: [
          {
            slug: "ketamine",
            name: "Ketamine",
            class: "dissociatives",
            matched_title_text: "Ketamine",
          },
        ],
      }),
      replication("direct"),
      replication("visual-fallback", { effect_slug: "visual-disconnection" }),
    ];
    const gallery = {
      curated_slugs: ["direct"],
      removed_slugs: [],
      carousel_order: ["direct"],
    };
    const test = galleryContext({
      pages: new Map([
        [
          null,
          { page: pageOneRows, continueCursor: "page-2", isDone: false },
        ],
        [
          "page-2",
          { page: pageTwoRows, continueCursor: "done", isDone: true },
        ],
      ]),
      gallery,
    });

    const accumulated: Awaited<
      ReturnType<typeof getPublicReplicationsForSubstancePageHandler>
    >["items"] = [];
    let cursor: string | undefined;
    let isDone = false;
    while (!isDone) {
      const page = await getPublicReplicationsForSubstancePageHandler(test.ctx, {
        substance_slug: "ketamine",
        cursor,
        limit: 64,
      });
      accumulated.push(...page.items);
      cursor = page.cursor;
      isDone = page.isDone;
    }

    const merged = mergeCuratedGallery(
      accumulated.map((item) => ({
        row: item.replication,
        provenance: item.provenance,
      })),
      gallery,
    );
    expect(merged.map((item) => item.row.slug)).toEqual([
      "direct",
      "specific-video",
      "specific-image",
      "class-video",
      "visual-fallback",
    ]);
    expect(test.collect).not.toHaveBeenCalled();
  });
});

describe("public matchable replication corpus pagination", () => {
  it("projects each page to exactly the placement-policy fields", async () => {
    const full = replication("full", {
      artist_url: "https://artist.example",
      role: "figure",
      effect_slug: "visual-disconnection",
      storage_id: "storage-full",
      thumbnail_storage_id: "thumb-full",
      width: 1920,
      height: 1080,
      file_size: 123456,
      title_drugs: [
        { slug: "lsd", name: "LSD", class: "psychedelics", matched_title_text: "LSD" },
      ],
      title_class_mentions: [
        { class: "dissociatives", matched_title_text: "Dissociative" },
      ],
      showcase_excluded: true,
      replication_status: "unreviewed",
    });
    const bare = replication("bare");
    const test = galleryContext({
      pages: new Map([
        [null, { page: [full, bare], continueCursor: "cursor-2", isDone: false }],
      ]),
    });

    const page = await getPublicMatchableReplicationsPageHandler(test.ctx, {});

    // `toEqual` is exact: no storage locators, rights metadata, URLs, or
    // Postgres internals may leak into the slim shared corpus.
    expect(page.items).toEqual([
      {
        slug: "full",
        title: "full",
        type: "image",
        role: "figure",
        effect_slug: "visual-disconnection",
        title_drugs: [
          { slug: "lsd", name: "LSD", class: "psychedelics", matched_title_text: "LSD" },
        ],
        title_class_mentions: [
          { class: "dissociatives", matched_title_text: "Dissociative" },
        ],
        showcase_excluded: true,
        replication_status: "unreviewed",
      },
      { slug: "bare", title: "bare", type: "image" },
    ]);
    expect(page.cursor).toBe("cursor-2");
    expect(page.isDone).toBe(false);
    expect(test.collect).not.toHaveBeenCalled();
  });

  it("clamps every raw page to the URL-free 256-row ceiling", async () => {
    const emptyPage = { page: [], continueCursor: "", isDone: true };
    const test = galleryContext({ pages: new Map([[null, emptyPage]]) });

    await getPublicMatchableReplicationsPageHandler(test.ctx, {});
    await getPublicMatchableReplicationsPageHandler(test.ctx, { limit: 5000 });
    await getPublicMatchableReplicationsPageHandler(test.ctx, { limit: -3 });
    await getPublicMatchableReplicationsPageHandler(test.ctx, { limit: 17.9 });

    expect(test.paginate.mock.calls.map(([opts]) => opts.numItems)).toEqual([
      256,
      256,
      1,
      17,
    ]);
  });
});
