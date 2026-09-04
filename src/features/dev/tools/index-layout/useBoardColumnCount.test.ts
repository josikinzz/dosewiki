import { describe, expect, it } from "vitest";
import {
  BOARD_COLUMN_GAP,
  BOARD_MIN_COLUMN_WIDTH,
  MAX_BOARD_COLUMNS,
  computeBoardColumnCount,
} from "./useBoardColumnCount";

describe("computeBoardColumnCount", () => {
  it("never packs more columns than the container can hold at the minimum width", () => {
    for (let width = 0; width <= 2400; width += 8) {
      const count = computeBoardColumnCount(width);
      const needed = count * BOARD_MIN_COLUMN_WIDTH + (count - 1) * BOARD_COLUMN_GAP;
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(MAX_BOARD_COLUMNS);
      if (count > 1) {
        expect(needed).toBeLessThanOrEqual(width);
      }
    }
  });

  it("fits three columns in the content box of a 1024px viewport with the dev rail open", () => {
    // 1024 minus the shell rail and page padding leaves roughly 900px.
    expect(computeBoardColumnCount(900)).toBe(3);
    // The previous viewport formula answered 3 for this width too, but laid
    // them out at a fixed 320px each, which is where the clipping came from.
    expect(3 * 320 + 2 * BOARD_COLUMN_GAP).toBeGreaterThan(900);
  });

  it("treats an unmeasured container as a single column", () => {
    expect(computeBoardColumnCount(0)).toBe(1);
    expect(computeBoardColumnCount(Number.NaN)).toBe(1);
  });
});
