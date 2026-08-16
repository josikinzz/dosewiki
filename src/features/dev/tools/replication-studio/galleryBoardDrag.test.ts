import { describe, expect, it } from "vitest";

import {
  applyBoardDrag,
  buildGalleryBoard,
  effectiveGalleryOrder,
  type GalleryCurationState,
  type GalleryMatch,
} from "./substanceGalleryPortalModel";

const CAP = 12;

function match(index: number): GalleryMatch {
  return {
    replication: {
      id: `id-${index}`,
      slug: `work-${index}`,
      title: `Work ${index}`,
      artist: "Hypnagogist",
      type: "image",
      effect_slug: "geometry",
      effect_name: "Geometry",
      effect_tags: [],
      credit_line: null,
      rights_status: "creator-retained",
      url: null,
      thumbnail_url: null,
      format: "png",
    },
    provenance: { matchedVia: "effect_slug", effectSlug: "geometry", effectName: "Geometry" },
  };
}

const MATCHES = Array.from({ length: 8 }, (_, index) => match(index));

function drag(state: GalleryCurationState, activeSlug: string, overId: string) {
  return applyBoardDrag(state, buildGalleryBoard(MATCHES, state, CAP), activeSlug, overId);
}

/**
 * What the article actually publishes for a curation — curated only. The board
 * and the public gate must agree, so this asserts the numbered rows and
 * `effectiveGalleryOrder` are the same list before returning it.
 */
function publicOrder(state: GalleryCurationState) {
  const numbered = buildGalleryBoard(MATCHES, state, CAP)
    .rows.filter((row) => row.position !== null)
    .map((row) => row.match.replication.slug);
  expect(effectiveGalleryOrder(MATCHES, state).map((entry) => entry.replication.slug)).toEqual(
    numbered,
  );
  return numbered;
}

describe("applyBoardDrag", () => {
  const curatedFour: GalleryCurationState = {
    curated: ["work-0", "work-1", "work-2", "work-3"],
    removed: [],
  };

  it("publishes the curated rows and nothing else", () => {
    expect(publicOrder(curatedFour)).toEqual(["work-0", "work-1", "work-2", "work-3"]);
    expect(publicOrder({ curated: [], removed: [] })).toEqual([]);
  });

  it("promotes a candidate onto a curated index without pinning the rows it passed", () => {
    // The old prefix rule pinned work-4 … work-6 to express this drop. Nothing
    // below the curated list is published now, so nothing has to be pinned.
    const next = drag(curatedFour, "work-7", "work-1");

    expect(next.curated).toEqual(["work-0", "work-7", "work-1", "work-2", "work-3"]);
    expect(publicOrder(next)).toEqual([
      "work-0",
      "work-7",
      "work-1",
      "work-2",
      "work-3",
    ]);
  });

  it("reorders inside the curated list without growing it", () => {
    const next = drag(curatedFour, "work-0", "work-2");

    expect(next.curated).toEqual(["work-1", "work-2", "work-0", "work-3"]);
    expect(publicOrder(next)).toEqual(["work-1", "work-2", "work-0", "work-3"]);
  });

  it("un-curates a row dropped onto a candidate: the pool carries no positions", () => {
    const next = drag(curatedFour, "work-1", "work-5");

    expect(next.curated).toEqual(["work-0", "work-2", "work-3"]);
    expect(publicOrder(next)).not.toContain("work-1");
  });

  it("cannot seed an empty curated list by dragging — publishing is the curate action", () => {
    const next = drag({ curated: [], removed: [] }, "work-3", "work-0");

    expect(next.curated).toEqual([]);
    expect(publicOrder(next)).toEqual([]);
  });

  it("un-curates when the drop lands off the rows, and no-ops on a self drop", () => {
    expect(drag(curatedFour, "work-1", "substance-gallery-auto-zone").curated).toEqual([
      "work-0",
      "work-2",
      "work-3",
    ]);
    expect(drag(curatedFour, "work-1", "work-1")).toBe(curatedFour);
  });

  it("never publishes an excluded row, even one left in the curated list", () => {
    // The invariant behind the deliriant exclusions: exclusion beats curation
    // at read time, so a stray curate can never resurrect a suppressed work.
    const withExclusion: GalleryCurationState = {
      curated: ["work-0", "work-2"],
      removed: ["work-2"],
    };

    expect(publicOrder(withExclusion)).toEqual(["work-0"]);

    const next = drag(withExclusion, "work-4", "work-0");
    expect(next.removed).toEqual(["work-2"]);
    expect(publicOrder(next)).toEqual(["work-4", "work-0"]);
  });
});

describe("buildGalleryBoard bands", () => {
  it("numbers curated rows and leaves the candidate pool unnumbered and off stage", () => {
    const board = buildGalleryBoard(MATCHES, { curated: ["work-5"], removed: [] }, CAP);

    expect(board.rows[0]).toMatchObject({ position: 1, onStage: true, band: "curated" });
    expect(board.rows.slice(1).every((row) => row.position === null)).toBe(true);
    expect(board.rows.slice(1).every((row) => !row.onStage)).toBe(true);
    expect(board.rows.slice(1).every((row) => row.band === "auto")).toBe(true);
    expect(board.candidateCount).toBe(7);
  });

  it("counts the empty slots against the curated list, not the eight matched rows", () => {
    const board = buildGalleryBoard(MATCHES, { curated: ["work-5"], removed: [] }, CAP);

    expect(board.rows).toHaveLength(8);
    expect(board.curatedCount).toBe(1);
    expect(board.filledSlots).toBe(1);
    expect(board.emptySlots).toBe(CAP - 1);
    expect(buildGalleryBoard(MATCHES, { curated: [], removed: [] }, CAP).emptySlots).toBe(CAP);
  });
});
