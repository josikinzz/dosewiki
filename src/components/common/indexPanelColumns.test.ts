import { describe, expect, it } from "vitest";

import {
  computeIndexPanelColumnCount,
  guessIndexPanelColumnCount,
  INDEX_PANEL_COLUMN_WIDTH,
  INDEX_PANEL_SMALL_GAP,
  INDEX_PANEL_LARGE_GAP,
} from "./indexPanelColumns";

describe("indexPanelColumns", () => {
  it("fits full-width panels using the actual container gap", () => {
    expect(computeIndexPanelColumnCount(660, Infinity, INDEX_PANEL_SMALL_GAP)).toBe(2);
    expect(computeIndexPanelColumnCount(660, Infinity, INDEX_PANEL_LARGE_GAP)).toBe(1);
    expect(computeIndexPanelColumnCount(1007.5, Infinity, INDEX_PANEL_LARGE_GAP)).toBe(2);
    expect(computeIndexPanelColumnCount(1008, Infinity, INDEX_PANEL_LARGE_GAP)).toBe(3);
    expect(computeIndexPanelColumnCount(1152, Infinity, INDEX_PANEL_LARGE_GAP)).toBe(3);
  });

  it("never allocates more full-width panels than the content box can hold", () => {
    for (const gap of [INDEX_PANEL_SMALL_GAP, INDEX_PANEL_LARGE_GAP]) {
      for (let width = INDEX_PANEL_COLUMN_WIDTH; width <= 3840; width += 1) {
        const columns = computeIndexPanelColumnCount(width, Infinity, gap);
        expect(columns * INDEX_PANEL_COLUMN_WIDTH + (columns - 1) * gap).toBeLessThanOrEqual(width);
        expect((columns + 1) * INDEX_PANEL_COLUMN_WIDTH + columns * gap).toBeGreaterThan(width);
      }
    }
  });

  it("keeps a narrow or initially unmeasured container in one column", () => {
    expect(computeIndexPanelColumnCount(0, Infinity, INDEX_PANEL_SMALL_GAP)).toBe(1);
    expect(computeIndexPanelColumnCount(288, Infinity, INDEX_PANEL_SMALL_GAP)).toBe(1);
  });

  it("honors caller caps in measured and server arrangements", () => {
    expect(computeIndexPanelColumnCount(2000, 3, INDEX_PANEL_LARGE_GAP)).toBe(3);
    expect(computeIndexPanelColumnCount(2000, 1, INDEX_PANEL_LARGE_GAP)).toBe(1);
    expect(guessIndexPanelColumnCount(1)).toBe(1);
    expect(guessIndexPanelColumnCount(3)).toBe(3);
  });
});
