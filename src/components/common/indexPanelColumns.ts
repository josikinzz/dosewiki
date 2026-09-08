/** Shared panel measure: neither a short group nor spare space widens a panel. */
export const INDEX_PANEL_COLUMN_WIDTH = 320;
export const INDEX_PANEL_SMALL_GAP = 20;
export const INDEX_PANEL_LARGE_GAP = 24;

/** Count full-width panels inside the measured content box, excluding gutters. */
export function computeIndexPanelColumnCount(
  availableWidth: number,
  maxColumns: number,
  gap: number,
): number {
  return Math.min(
    Math.max(1, Math.floor((Math.max(0, availableWidth) + gap) / (INDEX_PANEL_COLUMN_WIDTH + gap))),
    maxColumns,
  );
}

export function guessIndexPanelColumnCount(maxColumns: number): number {
  return Math.min(4, maxColumns);
}

export const INDEX_PANEL_COLUMN_GATE_ATTRIBUTE = "data-index-panel-column-gate";
export type IndexPanelColumnGate = "pending";

/**
 * Container width is unknown on the server, even when viewport width is known.
 * Keep its provisional grouping unpainted until the layout effect measures it.
 * The existing timeout remains a no-JS safety net for the server arrangement.
 */
export const INDEX_PANEL_COLUMN_GATE_CSS =
  `[${INDEX_PANEL_COLUMN_GATE_ATTRIBUTE}]{visibility:hidden;opacity:0;animation:index-panel-column-gate-timeout 0s linear 8s forwards}` +
  "@keyframes index-panel-column-gate-timeout{to{visibility:visible;opacity:1}}";
