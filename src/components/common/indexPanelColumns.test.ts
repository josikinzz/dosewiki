import { describe, expect, it } from "vitest";

import {
  computeIndexPanelColumnCount,
  guessIndexPanelColumnCount,
  INDEX_PANEL_COLUMN_GATE_CSS,
  indexPanelColumnGate,
  isIndexPanelColumnGateVisible,
} from "./indexPanelColumns";

const CAPS = [2, 3, 4, 5, 6, 8, Number.POSITIVE_INFINITY];

describe("indexPanelColumns", () => {
  it("leaves the gated grid visible exactly where the server guess matches the measurement", () => {
    for (const maxColumns of CAPS) {
      const gate = indexPanelColumnGate(maxColumns);
      expect(gate).not.toBeNull();
      const guess = guessIndexPanelColumnCount(maxColumns);

      for (let width = 320; width <= 3840; width += 1) {
        const measured = computeIndexPanelColumnCount(width, maxColumns);
        expect(
          isIndexPanelColumnGateVisible(gate!, width),
          `cap ${maxColumns} at ${width}px: guess ${guess}, measured ${measured}`,
        ).toBe(measured === guess);
      }
    }
  });

  it("never gates a single-column grid", () => {
    expect(indexPanelColumnGate(1)).toBeNull();
    expect(guessIndexPanelColumnCount(1)).toBe(1);
  });

  it("emits one media band per gate value plus the no-JS timeout", () => {
    expect(INDEX_PANEL_COLUMN_GATE_CSS).toContain('[data-index-panel-column-gate="2"]');
    expect(INDEX_PANEL_COLUMN_GATE_CSS).toContain('[data-index-panel-column-gate="5"]');
    expect(INDEX_PANEL_COLUMN_GATE_CSS).toContain("@keyframes index-panel-column-gate-timeout");
    expect(INDEX_PANEL_COLUMN_GATE_CSS).toContain("(width >= 1304px) and (width < 1628px)");
  });
});
