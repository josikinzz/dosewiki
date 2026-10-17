import { describe, expect, it } from "vitest";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import {
  buildGalleryBrowseUrl,
  parseGalleryBrowseState,
} from "@/features/replications/galleryUrlState";
import { groupByArtist, groupByEffect, groupByYear } from "./galleryModel";
import { sortWorksByTitle } from "./galleryOrdering";
import { defaultGalleryOrder, type GalleryMode } from "./galleryTypes";

function work(
  slug: string,
  overrides: Partial<PublicGalleryReplicationPreview> = {},
): PublicGalleryReplicationPreview {
  return {
    _id: slug,
    slug,
    title: slug,
    artist: "Example Artist",
    type: "image",
    format: "jpg",
    url: `/media/${slug}.jpg`,
    effect_slug: "geometry",
    created_at: "2024-01-01T00:00:00.000Z",
    date_info: { kind: "exact_date", value: "2024-01-01" },
    ...overrides,
  };
}

const slugs = (items: PublicGalleryReplicationPreview[]) => items.map((item) => item.slug);
const effectGroups = (items: PublicGalleryReplicationPreview[], order?: Parameters<typeof groupByEffect>[3]) =>
  groupByEffect(items, (slug) => slug, (slug) => `/effects/${slug}`, order);

const mixedTitles = ["zebra", "Beta", "apple", "Alpha", "beta", "alpha"];
const expectedTitles = [...mixedTitles].sort((a, b) => a.localeCompare(b));
const mixedWorks = mixedTitles.map((title, index) => work(`work-${index}`, { title }));

describe("alphabetical gallery ordering", () => {
  it("interleaves mixed-case titles using plain localeCompare without mutating the input", () => {
    const input = [...mixedWorks];
    expect(sortWorksByTitle(input).map((item) => item.title)).toEqual(expectedTitles);
    expect(input).toEqual(mixedWorks);
  });

  it("breaks equal-title ties by artist, then slug", () => {
    const items = [
      work("z", { title: "Same", artist: "Beta" }),
      work("b", { title: "Same", artist: "Alpha" }),
      work("a", { title: "Same", artist: "Alpha" }),
    ];
    expect(slugs(sortWorksByTitle(items))).toEqual(["a", "b", "z"]);
    expect(slugs(effectGroups(items, "alphabetical")[0].items)).toEqual(["a", "b", "z"]);
    expect(slugs(groupByYear(items, "alphabetical")[0].items)).toEqual(["a", "b", "z"]);
  });

  it("sorts inside artist rails while preserving heading order", () => {
    const items = [...mixedWorks, work("video", { artist: "Z Artist", type: "video" })];
    const groups = groupByArtist(items, [], "alphabetical");
    expect(groups.map((group) => group.key)).toEqual(groupByArtist(items).map((group) => group.key));
    expect(groups.map((group) => group.label)).toEqual(["Z Artist", "Example Artist"]);
    expect(groups[1].items.map((item) => item.title)).toEqual(expectedTitles);
  });

  it("sorts inside effect rails while preserving heading order", () => {
    const items = [...mixedWorks, work("other", { effect_slug: "drifting" })];
    const groups = effectGroups(items, "alphabetical");
    expect(groups.map((group) => group.key)).toEqual(effectGroups(items).map((group) => group.key));
    expect(groups[0].items.map((item) => item.title)).toEqual(expectedTitles);
  });

  it("sorts dated and undated year rails while keeping chronological headings", () => {
    const items = [
      ...mixedWorks,
      ...mixedWorks.map((item) => work(`older-${item.slug}`, { title: item.title, date_info: { kind: "year", value: "2023" } })),
      ...mixedWorks.map((item) => work(`undated-${item.slug}`, { title: item.title, date_info: undefined })),
    ];
    const groups = groupByYear(items, "alphabetical");
    expect(groups.map((group) => group.key)).toEqual(["2024", "2023", "undated"]);
    expect(groups.map((group) => group.key)).toEqual(groupByYear(items).map((group) => group.key));
    for (const group of groups) {
      expect(group.items.map((item) => item.title)).toEqual(expectedTitles);
    }
  });
});

const views: GalleryMode[] = ["artist", "effect", "year"];

describe("gallery order URL state", () => {
  it.each(views)("round-trips alphabetical order for %s", (view) => {
    const state = parseGalleryBrowseState(new URLSearchParams({ view, sort: "alphabetical" }));
    expect(state.view).toBe(view);
    expect(state.sort).toBe("alphabetical");
    const url = new URL(buildGalleryBrowseUrl(state), "https://example.com");
    expect(url.searchParams.get("sort")).toBe("alphabetical");
    expect(parseGalleryBrowseState(url.searchParams)).toEqual(state);
  });

  it.each(views)("preserves defaults and invalid-sort fallback for %s", (view) => {
    const expected = view === "effect" ? "curated" : "newest";
    expect(defaultGalleryOrder(view)).toBe(expected);
    for (const sort of ["", "invalid", ...(view === "effect" ? [] : ["curated"])]) {
      expect(parseGalleryBrowseState(new URLSearchParams({ view, sort })).sort).toBe(expected);
    }
    const url = new URL(buildGalleryBrowseUrl({ view, sort: expected }), "https://example.com");
    expect(url.searchParams.has("sort")).toBe(false);
    expect(parseGalleryBrowseState(url.searchParams).sort).toBe(expected);
  });

  it("preserves date and curated ordering", () => {
    const items = [
      work("older", { title: "Zebra", date_info: { kind: "exact_date", value: "2024-01-01" }, effect_order_index: { geometry: 0 } }),
      work("newer", { title: "Apple", date_info: { kind: "exact_date", value: "2024-02-01" }, effect_order_index: { geometry: 1 } }),
    ];
    expect(slugs(groupByArtist(items)[0].items)).toEqual(["newer", "older"]);
    expect(slugs(groupByArtist(items, [], "oldest")[0].items)).toEqual(["older", "newer"]);
    expect(slugs(effectGroups(items)[0].items)).toEqual(["older", "newer"]);
    expect(slugs(effectGroups(items, "newest")[0].items)).toEqual(["newer", "older"]);
    expect(slugs(effectGroups(items, "oldest")[0].items)).toEqual(["older", "newer"]);
    expect(slugs(groupByYear(items)[0].items)).toEqual(["newer", "older"]);
    expect(slugs(groupByYear(items, "oldest")[0].items)).toEqual(["older", "newer"]);
  });
});
