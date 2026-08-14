import { describe, expect, it } from "vitest";

import {
  applyCuratedDrag,
  curateSlug,
  curationStateOf,
  curationStatesEqual,
  effectiveGalleryOrder,
  excludeSlug,
  moveCuratedSlug,
  restoreSlug,
  splitGallery,
  summarizeProvenance,
  uncurateSlug,
  type GalleryCurationState,
  type GalleryMatch,
} from "./substanceGalleryPortalModel";

function match(slug: string, matchedVia: "effect_slug" | "effect_tags" = "effect_slug", effectSlug = "drifting"): GalleryMatch {
  return {
    replication: {
      id: `id-${slug}`,
      slug,
      title: slug,
      artist: "Chelsea Morgan",
      type: "image",
      effect_slug: effectSlug,
      effect_name: effectSlug,
      effect_tags: [],
      credit_line: null,
      rights_status: null,
      url: null,
      thumbnail_url: null,
      format: "png",
    },
    provenance: { matchedVia, effectSlug, effectName: effectSlug },
  };
}

const MATCHES = [
  match("a", "effect_slug", "drifting"),
  match("b", "effect_tags", "tracers"),
  match("c", "effect_slug", "tracers"),
  match("d", "effect_tags", "visual-haze"),
];

const EMPTY: GalleryCurationState = { curated: [], removed: [] };

describe("substanceGalleryPortalModel transitions", () => {
  it("curates to the tail of the head and lifts the slug off the excluded shelf", () => {
    const excluded = excludeSlug(EMPTY, "b");
    const state = curateSlug(curateSlug(excluded, "c"), "b");

    expect(state.curated).toEqual(["c", "b"]);
    expect(state.removed).toEqual([]);
  });

  it("excluding un-curates: a slug never sits in both lists", () => {
    const state = excludeSlug(curateSlug(EMPTY, "a"), "a");

    expect(state.curated).toEqual([]);
    expect(state.removed).toEqual(["a"]);
  });

  it("restore returns to the default order, not to the head", () => {
    const state = restoreSlug(excludeSlug(EMPTY, "b"), "b");

    expect(state).toEqual({ curated: [], removed: [] });
    const split = splitGallery(MATCHES, state);
    expect(split.auto.map((entry) => entry.replication.slug)).toEqual(["a", "b", "c", "d"]);
  });

  it("moves within the head and refuses to move past the edges", () => {
    const head = curateSlug(curateSlug(curateSlug(EMPTY, "a"), "b"), "c");

    expect(moveCuratedSlug(head, "c", "up").curated).toEqual(["a", "c", "b"]);
    expect(moveCuratedSlug(head, "a", "up")).toBe(head);
    expect(moveCuratedSlug(head, "c", "down")).toBe(head);
    expect(moveCuratedSlug(head, "d", "down")).toBe(head);
  });

  it("drag onto a curated slug takes its position; anywhere else un-curates", () => {
    const head = curateSlug(curateSlug(curateSlug(EMPTY, "a"), "b"), "c");

    expect(applyCuratedDrag(head, "c", "a").curated).toEqual(["c", "a", "b"]);
    expect(applyCuratedDrag(head, "b", "auto-zone").curated).toEqual(["a", "c"]);
    expect(applyCuratedDrag(head, "not-curated", "a")).toBe(head);
  });
});

describe("splitGallery and the effective public order", () => {
  it("partitions into the three temperatures, head in stored order", () => {
    const state: GalleryCurationState = { curated: ["c", "a"], removed: ["d"] };
    const split = splitGallery(MATCHES, state);

    expect(split.curated.map((entry) => entry.replication.slug)).toEqual(["c", "a"]);
    expect(split.auto.map((entry) => entry.replication.slug)).toEqual(["b"]);
    expect(split.excluded.map((entry) => entry.replication.slug)).toEqual(["d"]);
    expect(effectiveGalleryOrder(MATCHES, state).map((entry) => entry.replication.slug)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("silently ignores curated or removed slugs that match nothing, like the public merge", () => {
    const state: GalleryCurationState = { curated: ["ghost", "b"], removed: ["phantom"] };
    const split = splitGallery(MATCHES, state);

    expect(split.curated.map((entry) => entry.replication.slug)).toEqual(["b"]);
    expect(split.excluded).toEqual([]);
    expect(split.auto.map((entry) => entry.replication.slug)).toEqual(["a", "c", "d"]);
  });
});

describe("dirty state across a save round trip", () => {
  it("edits dirty the state and adopting the server's pruned echo clears it", () => {
    const saved = curationStateOf({
      curated_slugs: ["a", "ghost"],
      removed_slugs: ["d"],
      updated_at: "2026-08-14T00:00:00.000Z",
      updated_by: "editor@example.com",
    });
    let working: GalleryCurationState = {
      curated: [...saved.curated],
      removed: [...saved.removed],
    };
    expect(curationStatesEqual(working, saved)).toBe(true);

    working = uncurateSlug(curateSlug(working, "b"), "ghost");
    expect(curationStatesEqual(working, saved)).toBe(false);

    // The server prunes "ghost" (already un-curated here) and echoes the rest.
    const echo = { curated: ["a", "b"], removed: ["d"] };
    expect(curationStatesEqual(working, echo)).toBe(true);
  });
});

describe("summarizeProvenance", () => {
  it("counts matches, distinct effects, and the slug/tag split", () => {
    expect(summarizeProvenance(MATCHES)).toEqual({
      matched: 4,
      effectCount: 3,
      viaEffectSlug: 2,
      viaEffectTags: 2,
    });
    expect(summarizeProvenance([])).toEqual({
      matched: 0,
      effectCount: 0,
      viaEffectSlug: 0,
      viaEffectTags: 0,
    });
  });
});
