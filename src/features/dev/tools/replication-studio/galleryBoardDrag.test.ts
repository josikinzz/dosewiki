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
    provenance: {
      matchedVia: "specific_drug",
      effectSlug: "geometry",
      effectName: "Geometry",
      substanceSlug: "lsd",
    },
  };
}

const MATCHES = Array.from({ length: 8 }, (_, index) => match(index));

function drag(state: GalleryCurationState, activeSlug: string, overId: string) {
  return applyBoardDrag(state, buildGalleryBoard(MATCHES, state, CAP), activeSlug, overId);
}

/** The board and public helper must agree on the complete effective order. */
function publicOrder(state: GalleryCurationState) {
  const numbered = [...buildGalleryBoard(MATCHES, state, CAP).rows]
    .sort((left, right) => left.position - right.position)
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

  it("publishes automatic rows with stored priorities first inside their tier", () => {
    expect(publicOrder(curatedFour)).toEqual([
      "work-0", "work-1", "work-2", "work-3", "work-4", "work-5", "work-6", "work-7",
    ]);
    expect(publicOrder({ curated: [], removed: [] })).toEqual([
      "work-0", "work-1", "work-2", "work-3", "work-4", "work-5", "work-6", "work-7",
    ]);
  });

  it("prioritizes an automatic row without pinning the rows it passed", () => {
    const next = drag(curatedFour, "work-7", "work-1");

    expect(next.curated).toEqual(["work-0", "work-7", "work-1", "work-2", "work-3"]);
    expect(publicOrder(next)).toEqual([
      "work-0",
      "work-7",
      "work-1",
      "work-2",
      "work-3",
      "work-4",
      "work-5",
      "work-6",
    ]);
  });

  it("reorders stored priorities without growing the list", () => {
    const next = drag(curatedFour, "work-0", "work-2");

    expect(next.curated).toEqual(["work-1", "work-2", "work-0", "work-3"]);
    expect(publicOrder(next)).toEqual([
      "work-1", "work-2", "work-0", "work-3", "work-4", "work-5", "work-6", "work-7",
    ]);
  });

  it("removes stored priority when dropped onto an automatic row", () => {
    const next = drag(curatedFour, "work-1", "work-5");

    expect(next.curated).toEqual(["work-0", "work-2", "work-3"]);
    expect(publicOrder(next)).toEqual([
      "work-0", "work-2", "work-3", "work-1", "work-4", "work-5", "work-6", "work-7",
    ]);
  });

  it("cannot seed an empty priority list by dragging", () => {
    const next = drag({ curated: [], removed: [] }, "work-3", "work-0");

    expect(next.curated).toEqual([]);
    expect(publicOrder(next)).toEqual([
      "work-0", "work-1", "work-2", "work-3", "work-4", "work-5", "work-6", "work-7",
    ]);
  });

  it("un-curates when the drop lands off the rows, and no-ops on a self drop", () => {
    expect(drag(curatedFour, "work-1", "substance-gallery-auto-zone").curated).toEqual([
      "work-0",
      "work-2",
      "work-3",
    ]);
    expect(drag(curatedFour, "work-1", "work-1")).toBe(curatedFour);
  });

  it("never publishes an excluded row, even one left in the priority list", () => {
    const withExclusion: GalleryCurationState = {
      curated: ["work-0", "work-2"],
      removed: ["work-2"],
    };

    expect(publicOrder(withExclusion)).toEqual([
      "work-0", "work-1", "work-3", "work-4", "work-5", "work-6", "work-7",
    ]);

    const next = drag(withExclusion, "work-4", "work-0");
    expect(next.removed).toEqual(["work-2"]);
    expect(publicOrder(next)).toEqual([
      "work-4", "work-0", "work-1", "work-3", "work-5", "work-6", "work-7",
    ]);
  });
});

describe("buildGalleryBoard bands", () => {
  it("numbers priority and automatic rows by effective article position", () => {
    const board = buildGalleryBoard(MATCHES, { curated: ["work-5"], removed: [] }, CAP);

    expect(board.rows[0]).toMatchObject({ position: 1, onStage: true, band: "curated" });
    expect(board.rows.slice(1).every((row) => row.position > 1)).toBe(true);
    expect(board.rows.slice(1).every((row) => row.onStage)).toBe(true);
    expect(board.rows.slice(1).every((row) => row.band === "auto")).toBe(true);
    expect(board.candidateCount).toBe(7);
  });

  it("counts empty slots against every effective placement", () => {
    const board = buildGalleryBoard(MATCHES, { curated: ["work-5"], removed: [] }, CAP);

    expect(board.rows).toHaveLength(8);
    expect(board.curatedCount).toBe(1);
    expect(board.filledSlots).toBe(8);
    expect(board.emptySlots).toBe(CAP - 8);
    expect(buildGalleryBoard(MATCHES, { curated: [], removed: [] }, CAP).emptySlots).toBe(CAP - 8);
  });
});
