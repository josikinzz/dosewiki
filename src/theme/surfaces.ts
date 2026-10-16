export type SurfaceId = "orchid" | "abyss" | "canopy" | "garnet" | "sunset" | "graphite" | "lagoon";

export const BASE_SURFACE_ID: SurfaceId = "orchid";

export const BASE_SURFACE_TINT = { dark: "#1f0527", light: "#f6e6f4" } as const;

export type ProSurfaceSeeds = Readonly<Record<string, string>>;

export const BASE_SURFACE_PRO_SEEDS: {
  readonly light: ProSurfaceSeeds;
  readonly dark: ProSurfaceSeeds;
} = {
  light: {
    "--ei-paper": "#f6f5f1",
    "--ei-surface": "#fbfaf8",
    "--ei-surface-raised": "#ffffff",
    "--ei-surface-sunk": "#efeee9",
    "--ei-surface-deep": "#e4e2db",
    "--ei-chrome": "#efeee9",
    "--ei-border": "#dcdad3",
    "--ei-fade": "rgb(246 245 241 / 0.88)",
  },
  dark: {
    "--ei-paper": "#131313",
    "--ei-surface": "#191919",
    "--ei-surface-raised": "#212121",
    "--ei-surface-sunk": "#0c0c0c",
    "--ei-surface-deep": "#070707",
    "--ei-chrome": "#191919",
    "--ei-border": "#3f3f3f",
    "--ei-fade": "rgb(19 19 19 / 0.88)",
  },
};

export function isSurface(value: string | null | undefined): value is SurfaceId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(LEGACY_SURFACE_TO_HUE, value)
  );
}

export const LEGACY_SURFACE_TO_HUE: Record<SurfaceId, { hue: number; chroma?: 0 }> = {
  orchid: { hue: 0 },
  abyss: { hue: 249 },
  canopy: { hue: 184 },
  garnet: { hue: 59 },
  sunset: { hue: 79 },
  graphite: { hue: 0, chroma: 0 },
  lagoon: { hue: 221 },
};
