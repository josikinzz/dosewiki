/**
 * Color mapping for ProtestKit reagent test results.
 * Maps color IDs from the API to their corresponding hex values.
 */
const REAGENT_UI_COLORS: Record<number, string> = {
  0: "#ffffff", // BLANK
  1: "#bfbfbf", // black1 (light gray)
  2: "#666666", // black2 (gray)
  3: "#111111", // black3 (near black)
  4: "#41a7f8", // light blue
  5: "#0067ce", // blue
  6: "#020f69", // dark blue
  7: "#7aefa6", // light green
  8: "#3f8a1f", // green
  9: "#204a1c", // dark green
  10: "#ffffcc", // pale yellow
  11: "#f0d41d", // yellow
  12: "#deb22e", // amber/gold
  13: "#fde9d9", // cream/peach
  14: "#fd7322", // orange
  15: "#c04d01", // dark orange
  16: "#8e563a", // brown
  17: "#51240b", // dark brown
  18: "#320a0b", // very dark brown
  19: "#ff6666", // light red
  20: "#ff0000", // red
  21: "#8c113e", // dark red/maroon
  22: "#d59aca", // light pink
  23: "#ff6fcf", // pink
  24: "#830c93", // purple
  25: "#8064a2", // light purple
  26: "#50268d", // medium purple
  27: "#270d45", // dark purple
};

/**
 * Get hex color from color ID, with fallback for unknown IDs.
 */
export function getReagentColorHex(colorId: number): string {
  return REAGENT_UI_COLORS[colorId] ?? "#666666";
}
