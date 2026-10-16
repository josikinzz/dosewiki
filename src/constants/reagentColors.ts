const REAGENT_UI_COLORS: Record<number, string> = {
  0: "#ffffff",
  1: "#bfbfbf",
  2: "#666666",
  3: "#111111",
  4: "#41a7f8",
  5: "#0067ce",
  6: "#020f69",
  7: "#7aefa6",
  8: "#3f8a1f",
  9: "#204a1c",
  10: "#ffffcc",
  11: "#f0d41d",
  12: "#deb22e",
  13: "#fde9d9",
  14: "#fd7322",
  15: "#c04d01",
  16: "#8e563a",
  17: "#51240b",
  18: "#320a0b",
  19: "#ff6666",
  20: "#ff0000",
  21: "#8c113e",
  22: "#d59aca",
  23: "#ff6fcf",
  24: "#830c93",
  25: "#8064a2",
  26: "#50268d",
  27: "#270d45",
};

export function getReagentColorHex(colorId: number): string {
  return REAGENT_UI_COLORS[colorId] ?? "#666666";
}
