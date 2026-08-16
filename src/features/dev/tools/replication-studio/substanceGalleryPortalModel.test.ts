import { describe, expect, it } from "vitest";

import {
  applyBoardDrag,
  buildGalleryBoard,
  canRedo,
  canUndo,
  curateSlug,
  curateSlugAt,
  curationStateOf,
  curationStatesEqual,
  effectiveGalleryOrder,
  excludeSlug,
  historyOf,
  HISTORY_LIMIT,
  moveCuratedSlug,
  moveCuratedSlugToEdge,
  pushHistory,
  redoHistory,
  restoreSlug,
  summarizeProvenance,
  uncurateSlug,
  undoHistory,
  type CurationHistory,
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

/** `count` matches named r1…rN, for exercising the cap boundary. */
function manyMatches(count: number): GalleryMatch[] {
  return Array.from({ length: count }, (_, index) => match(`r${index + 1}`));
}

const EMPTY: GalleryCurationState = { curated: [], removed: [] };
const CAP = 12;

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
    const board = buildGalleryBoard(MATCHES, state, CAP);
    expect(board.rows.map((row) => row.band)).toEqual(["auto", "auto", "auto", "auto"]);
    expect(board.rows.map((row) => row.match.replication.slug)).toEqual(["a", "b", "c", "d"]);
  });

  it("moves within the head and refuses to move past the edges", () => {
    const head = curateSlug(curateSlug(curateSlug(EMPTY, "a"), "b"), "c");

    expect(moveCuratedSlug(head, "c", "up").curated).toEqual(["a", "c", "b"]);
    expect(moveCuratedSlug(head, "a", "up")).toBe(head);
    expect(moveCuratedSlug(head, "c", "down")).toBe(head);
    expect(moveCuratedSlug(head, "d", "down")).toBe(head);
  });
});

describe("curateSlugAt", () => {
  it("clamps out-of-range indices instead of leaving gaps", () => {
    const head: GalleryCurationState = { curated: ["a", "b"], removed: [] };

    expect(curateSlugAt(head, "c", 99).curated).toEqual(["a", "b", "c"]);
    expect(curateSlugAt(head, "c", -4).curated).toEqual(["c", "a", "b"]);
    // A move re-inserts into a shorter head, so the last valid index is length - 1.
    expect(curateSlugAt(head, "a", 99).curated).toEqual(["b", "a"]);
  });

  it("lifts the slug off the excluded shelf", () => {
    const state: GalleryCurationState = { curated: ["a"], removed: ["c", "d"] };
    const next = curateSlugAt(state, "c", 0);

    expect(next.curated).toEqual(["c", "a"]);
    expect(next.removed).toEqual(["d"]);
  });

  it("is a no-op by reference when the slug already holds that index", () => {
    const head: GalleryCurationState = { curated: ["a", "b"], removed: [] };

    expect(curateSlugAt(head, "b", 1)).toBe(head);
  });
});

describe("moveCuratedSlugToEdge", () => {
  it("jumps to either edge and no-ops by reference when already there", () => {
    const head: GalleryCurationState = { curated: ["a", "b", "c"], removed: [] };

    expect(moveCuratedSlugToEdge(head, "c", "top").curated).toEqual(["c", "a", "b"]);
    expect(moveCuratedSlugToEdge(head, "a", "bottom").curated).toEqual(["b", "c", "a"]);
    expect(moveCuratedSlugToEdge(head, "a", "top")).toBe(head);
    expect(moveCuratedSlugToEdge(head, "c", "bottom")).toBe(head);
    expect(moveCuratedSlugToEdge(head, "ghost", "top")).toBe(head);
  });
});

describe("applyBoardDrag", () => {
  const drag = (state: GalleryCurationState, activeSlug: string, overId: string) =>
    applyBoardDrag(state, buildGalleryBoard(MATCHES, state, CAP), activeSlug, overId);

  it("promotes an auto row into the head at the index it was dropped on", () => {
    const state: GalleryCurationState = { curated: ["a", "b"], removed: [] };
    const next = drag(state, "d", "a");

    expect(next.curated).toEqual(["d", "a", "b"]);
    expect(buildGalleryBoard(MATCHES, next, CAP).rows.map((row) => row.band)).toEqual([
      "curated",
      "curated",
      "curated",
      "auto",
    ]);
  });

  it("reorders inside the head when both slugs are curated", () => {
    const state: GalleryCurationState = { curated: ["a", "b", "c"], removed: [] };

    expect(drag(state, "c", "a").curated).toEqual(["c", "a", "b"]);
  });

  it("un-curates when the drop id is not a row", () => {
    const state: GalleryCurationState = { curated: ["a", "b", "c"], removed: [] };

    expect(drag(state, "b", "auto-zone").curated).toEqual(["a", "c"]);
    expect(drag(state, "a", "a")).toBe(state);
  });
});

describe("buildGalleryBoard", () => {
  it("numbers continuously across the curated head and the auto tail", () => {
    const state: GalleryCurationState = { curated: ["c", "a"], removed: [] };
    const board = buildGalleryBoard(MATCHES, state, CAP);

    expect(board.rows.map((row) => [row.match.replication.slug, row.position, row.band])).toEqual([
      ["c", 1, "curated"],
      ["a", 2, "curated"],
      ["b", 3, "auto"],
      ["d", 4, "auto"],
    ]);
    expect(board.curatedCount).toBe(2);
    expect(board.cap).toBe(CAP);
    expect(effectiveGalleryOrder(MATCHES, state).map((entry) => entry.replication.slug)).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  it("puts onStage boundary exactly at the cap", () => {
    for (const [total, expectedOnStage] of [
      [11, 11],
      [12, 12],
      [13, 12],
    ] as const) {
      const board = buildGalleryBoard(manyMatches(total), EMPTY, CAP);

      expect(board.rows).toHaveLength(total);
      expect(board.rows.filter((row) => row.onStage)).toHaveLength(expectedOnStage);
      // The last on-stage row is exactly the cap-th, and nothing past it stays on.
      expect(board.rows[expectedOnStage - 1].onStage).toBe(true);
      expect(board.rows.slice(CAP).some((row) => row.onStage)).toBe(false);
      expect(board.filledSlots).toBe(expectedOnStage);
      expect(board.emptySlots).toBe(Math.max(0, CAP - total));
    }
  });

  it("reports the unfilled slots when the board is short of the cap", () => {
    const board = buildGalleryBoard(MATCHES, EMPTY, CAP);

    expect(board.filledSlots).toBe(4);
    expect(board.emptySlots).toBe(8);
    expect(buildGalleryBoard([], EMPTY, CAP).emptySlots).toBe(CAP);
  });

  it("drops curated slugs that match nothing without leaving a numbering hole", () => {
    const state: GalleryCurationState = { curated: ["ghost", "b", "phantom"], removed: [] };
    const board = buildGalleryBoard(MATCHES, state, CAP);

    expect(board.rows.map((row) => [row.match.replication.slug, row.position])).toEqual([
      ["b", 1],
      ["a", 2],
      ["c", 3],
      ["d", 4],
    ]);
    expect(board.curatedCount).toBe(1);
  });

  it("never numbers an excluded match, and lists exclusions in corpus order", () => {
    const state: GalleryCurationState = { curated: ["d", "a"], removed: ["d", "b"] };
    const board = buildGalleryBoard(MATCHES, state, CAP);

    expect(board.rows.map((row) => [row.match.replication.slug, row.position, row.band])).toEqual([
      ["a", 1, "curated"],
      ["c", 2, "auto"],
    ]);
    expect(board.excluded.map((entry) => entry.replication.slug)).toEqual(["b", "d"]);
    expect(board.filledSlots).toBe(2);
    expect(board.emptySlots).toBe(10);
  });
});

describe("curation history", () => {
  const s0: GalleryCurationState = { curated: [], removed: [] };
  const s1: GalleryCurationState = { curated: ["a"], removed: [] };
  const s2: GalleryCurationState = { curated: ["a", "b"], removed: [] };

  it("round trips undo and redo", () => {
    const start = historyOf(s0);
    expect(canUndo(start)).toBe(false);
    expect(canRedo(start)).toBe(false);

    const pushed = pushHistory(pushHistory(start, s1), s2);
    expect(pushed.present).toBe(s2);
    expect(canUndo(pushed)).toBe(true);

    const undone = undoHistory(undoHistory(pushed));
    expect(undone.present).toBe(s0);
    expect(canUndo(undone)).toBe(false);
    expect(canRedo(undone)).toBe(true);

    const redone = redoHistory(redoHistory(undone));
    expect(redone.present).toBe(s2);
    expect(redone.past).toEqual([s0, s1]);
    expect(canRedo(redone)).toBe(false);
    expect(redoHistory(redone)).toBe(redone);
    expect(undoHistory(start)).toBe(start);
  });

  it("a new push abandons the redo branch", () => {
    const undone = undoHistory(pushHistory(pushHistory(historyOf(s0), s1), s2));
    expect(undone.future).toEqual([s2]);

    const branched = pushHistory(undone, { curated: ["z"], removed: [] });
    expect(branched.future).toEqual([]);
    expect(canRedo(branched)).toBe(false);
  });

  it("a no-op mutation returns the same history reference", () => {
    const history = pushHistory(historyOf(s0), s1);

    expect(pushHistory(history, s1)).toBe(history);
    expect(pushHistory(history, uncurateSlug(s1, "not-curated"))).toBe(history);
  });

  it("evicts the oldest states past HISTORY_LIMIT", () => {
    let history: CurationHistory = historyOf({ curated: ["s0"], removed: [] });
    for (let index = 1; index <= HISTORY_LIMIT + 10; index += 1) {
      history = pushHistory(history, { curated: [`s${index}`], removed: [] });
    }

    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0].curated).toEqual(["s10"]);
    expect(history.past[HISTORY_LIMIT - 1].curated).toEqual(["s59"]);
    expect(history.present.curated).toEqual(["s60"]);
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
