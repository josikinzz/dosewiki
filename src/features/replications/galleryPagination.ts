import type { PublicGalleryReplicationPreview } from "@/types/replications";

export type GalleryContinuationPage = {
  data: PublicGalleryReplicationPreview[];
  nextCursor: string | null;
  hasMore: boolean;
};

type DrainGalleryPagesOptions = {
  initialItems: readonly PublicGalleryReplicationPreview[];
  initialCursor: string | null;
  fetchPage: (cursor: string) => Promise<GalleryContinuationPage>;
  onPage?: (result: DrainGalleryPagesResult) => void;
};

export type DrainGalleryPagesResult = {
  items: PublicGalleryReplicationPreview[];
  cursor: string | null;
  hasMore: boolean;
  pagesLoaded: number;
};

/**
 * Follow opaque continuation cursors until the bounded page source is done.
 *
 * Each response remains one small page. Empty and duplicate-only pages still
 * advance, while a missing or repeated continuation fails closed instead of
 * spinning forever.
 */
export async function drainGalleryPages({
  initialItems,
  initialCursor,
  fetchPage,
  onPage,
}: DrainGalleryPagesOptions): Promise<DrainGalleryPagesResult> {
  const byId = new Map(initialItems.map((item) => [item._id, item]));
  const visitedCursors = new Set<string>();
  let cursor = initialCursor;
  let hasMore = Boolean(cursor);
  let pagesLoaded = 0;

  while (hasMore && cursor) {
    if (visitedCursors.has(cursor)) {
      throw new Error("Gallery continuation repeated a cursor");
    }
    visitedCursors.add(cursor);

    const page = await fetchPage(cursor);
    for (const item of page.data) byId.set(item._id, item);
    pagesLoaded += 1;
    cursor = page.nextCursor;
    hasMore = page.hasMore;
    if (hasMore && !cursor) {
      throw new Error("Gallery continuation omitted its next cursor");
    }
    onPage?.({
      items: [...byId.values()],
      cursor,
      hasMore,
      pagesLoaded,
    });
  }

  return {
    items: [...byId.values()],
    cursor,
    hasMore,
    pagesLoaded,
  };
}
