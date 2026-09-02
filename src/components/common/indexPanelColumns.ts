/**
 * Column math for the index panel grids, shared by the measuring hook and the
 * grid primitive so the server guess, the client measurement, and the
 * pre-paint CSS gate are all derived from the same numbers.
 *
 * The column count is client-only information (viewport width) that the
 * server still has to commit to some DOM for. Rather than paint that guess
 * and correct it after hydration, which reshuffles every card in view, the
 * grid ships with a gate attribute while unmeasured and generated media
 * queries keep it unpainted in exactly the viewport bands where the guess is
 * wrong. Where the guess is right the first paint is already final.
 */

export const INDEX_PANEL_MIN_COLUMN_WIDTH = 300;

const HORIZONTAL_PADDING = 32;
const COLUMN_GAP = 24;
const COLUMN_STRIDE = INDEX_PANEL_MIN_COLUMN_WIDTH + COLUMN_GAP;

const BREAKPOINTS = {
  sm: 480,
  md: 768,
  lg: 1024,
} as const;

/**
 * The server guess for an uncapped grid. Four columns covers the 1304-1627px
 * band, which is where the common laptop viewports (1366, 1440, 1536) land.
 */
const UNCAPPED_GUESS = 4;

export const INDEX_PANEL_COLUMN_GATE_ATTRIBUTE = "data-index-panel-column-gate";

/**
 * The gate attribute value: the guess's viewport band, keyed by the effective
 * cap. Caps above the guess share one band because the guess is exact there;
 * a cap at or below it only needs a lower bound. A cap of one never hides.
 */
export type IndexPanelColumnGate = "2" | "3" | "4" | "5";

export function computeIndexPanelColumnCount(width: number, maxColumns: number): number {
  const availableWidth = Math.max(0, width - HORIZONTAL_PADDING);
  const widthBasedColumns = Math.max(
    1,
    Math.floor((availableWidth + COLUMN_GAP) / COLUMN_STRIDE),
  );
  const responsiveColumns =
    width < BREAKPOINTS.sm ? 1
    : width < BREAKPOINTS.md ? 2
    : width < BREAKPOINTS.lg ? 3
    : widthBasedColumns;

  return Math.min(responsiveColumns, maxColumns);
}

export function guessIndexPanelColumnCount(maxColumns: number): number {
  return Math.min(UNCAPPED_GUESS, maxColumns);
}

export function indexPanelColumnGate(maxColumns: number): IndexPanelColumnGate | null {
  if (maxColumns <= 1) {
    return null;
  }
  return String(Math.min(Math.floor(maxColumns), UNCAPPED_GUESS + 1)) as IndexPanelColumnGate;
}

/** Smallest viewport width at which the width-based formula yields `columns`. */
function widthBasedLowerBound(columns: number): number {
  return columns * COLUMN_STRIDE + HORIZONTAL_PADDING - COLUMN_GAP;
}

const GATE_BANDS: Record<IndexPanelColumnGate, { min: number; max?: number }> = {
  "2": { min: BREAKPOINTS.sm },
  "3": { min: BREAKPOINTS.md },
  "4": { min: widthBasedLowerBound(UNCAPPED_GUESS) },
  "5": {
    min: widthBasedLowerBound(UNCAPPED_GUESS),
    max: widthBasedLowerBound(UNCAPPED_GUESS + 1),
  },
};

const GATE_SELECTOR = `[${INDEX_PANEL_COLUMN_GATE_ATTRIBUTE}]`;

/**
 * Hidden while gated, except inside the guess's band. The delayed animation is
 * the no-JS safety net: a reader whose script never runs still gets the grid,
 * just in the server's arrangement.
 */
export const INDEX_PANEL_COLUMN_GATE_CSS =
  `${GATE_SELECTOR}{visibility:hidden;opacity:0;animation:index-panel-column-gate-timeout 0s linear 8s forwards}` +
  "@keyframes index-panel-column-gate-timeout{to{visibility:visible;opacity:1}}" +
  (Object.entries(GATE_BANDS) as Array<[IndexPanelColumnGate, { min: number; max?: number }]>)
    .map(([gate, { min, max }]) => {
      const query =
        max === undefined
          ? `(width >= ${min}px)`
          : `(width >= ${min}px) and (width < ${max}px)`;
      return `@media ${query}{[${INDEX_PANEL_COLUMN_GATE_ATTRIBUTE}="${gate}"]{visibility:visible;opacity:1}}`;
    })
    .join("");

/** Test seam: does the pre-paint CSS leave a gated grid visible at this width? */
export function isIndexPanelColumnGateVisible(gate: IndexPanelColumnGate, width: number): boolean {
  const { min, max } = GATE_BANDS[gate];
  return width >= min && (max === undefined || width < max);
}
