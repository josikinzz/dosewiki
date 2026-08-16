import { describe, expect, it } from "vitest";

import {
  applyBoardDrag,
  buildGalleryBoard,
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

/** The public order the article would draw for a curation. */
function publicOrder(state: GalleryCurationState) {
  return buildGalleryBoard(MATCHES, state, CAP).rows.map((row) => row.match.replication.slug);
}

describe("applyBoardDrag", () => {
  const pinnedHead: GalleryCurationState = {
    curated: ["work-0", "work-1", "work-2", "work-3"],
    removed: [],
  };

  it("keeps a row dropped inside the derived tail, pinning only as far as the drop", () => {
    // The regression: a curated prefix cannot express a tail position, so this
    // drop used to fall through to "un-curate" and vanish.
    const next = drag(pinnedHead, "work-7", "work-5");

    expect(publicOrder(next)).toEqual([
      "work-0",
      "work-1",
      "work-2",
      "work-3",
      "work-4",
      "work-7",
      "work-5",
      "work-6",
    ]);
    expect(next.curated).toEqual(["work-0", "work-1", "work-2", "work-3", "work-4", "work-7"]);
  });

  it("leaves everything past the drop derived", () => {
    const next = drag(pinnedHead, "work-5", "work-4");

    expect(next.curated).toEqual(["work-0", "work-1", "work-2", "work-3", "work-5"]);
    expect(publicOrder(next).slice(5)).toEqual(["work-4", "work-6", "work-7"]);
  });

  it("reorders inside the curated head without growing it", () => {
    const next = drag(pinnedHead, "work-0", "work-2");

    expect(next.curated).toEqual(["work-1", "work-2", "work-0", "work-3"]);
  });

  it("promotes a tail row dropped onto a curated position", () => {
    const next = drag(pinnedHead, "work-6", "work-1");

    expect(next.curated).toEqual(["work-0", "work-6", "work-1", "work-2", "work-3"]);
  });

  it("orders a never-curated gallery from the first drag", () => {
    const next = drag({ curated: [], removed: [] }, "work-3", "work-0");

    expect(next.curated).toEqual(["work-3"]);
    expect(publicOrder(next)).toEqual([
      "work-3",
      "work-0",
      "work-1",
      "work-2",
      "work-4",
      "work-5",
      "work-6",
      "work-7",
    ]);
  });

  it("un-curates when the drop lands off the rows, and no-ops on a self drop", () => {
    expect(drag(pinnedHead, "work-1", "substance-gallery-auto-zone").curated).toEqual([
      "work-0",
      "work-2",
      "work-3",
    ]);
    expect(drag(pinnedHead, "work-1", "work-1")).toBe(pinnedHead);
  });

  it("never resurrects an excluded row by dragging around it", () => {
    const withExclusion: GalleryCurationState = { curated: ["work-0"], removed: ["work-2"] };
    const next = drag(withExclusion, "work-4", "work-1");

    expect(next.removed).toEqual(["work-2"]);
    expect(publicOrder(next)).not.toContain("work-2");
  });
});
