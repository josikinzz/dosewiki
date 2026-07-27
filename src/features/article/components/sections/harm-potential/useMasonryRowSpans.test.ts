import { describe, expect, it } from "vitest";
import {
  getMasonryRowSpan,
  MASONRY_ROW_GAP_PX,
  MASONRY_ROW_HEIGHT_PX,
} from "./useMasonryRowSpans";

describe("getMasonryRowSpan", () => {
  it("covers the card plus its bottom gutter", () => {
    // 200px card + 16px gutter = 216px, which needs 54 rows of 4px.
    expect(getMasonryRowSpan(200)).toBe(54);
  });

  it("rounds up so a card never overflows its allocated rows", () => {
    const height = 201;
    const span = getMasonryRowSpan(height);
    expect(span * MASONRY_ROW_HEIGHT_PX).toBeGreaterThanOrEqual(height + MASONRY_ROW_GAP_PX);
    expect(getMasonryRowSpan(201)).toBe(55);
  });

  it("grows the span when a card expands", () => {
    expect(getMasonryRowSpan(400)).toBeGreaterThan(getMasonryRowSpan(200));
  });

  it("never returns a zero or negative span", () => {
    expect(getMasonryRowSpan(0)).toBeGreaterThanOrEqual(1);
    // A detached/hidden card can measure 0; anything past -gutter clamps to one row.
    expect(getMasonryRowSpan(-MASONRY_ROW_GAP_PX)).toBe(1);
    expect(getMasonryRowSpan(-100)).toBe(1);
  });
});
