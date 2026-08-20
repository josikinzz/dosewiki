import { getPreset, type PalettePresetId, type PresetOverrides } from "@/features/theme-lab/palettePresets";

export type SurfaceId = "orchid" | "abyss" | "canopy" | "garnet" | "sunset" | "graphite" | "lagoon";

export type Surface = {
  readonly id: SurfaceId;
  readonly label: string;
  readonly overrides: PresetOverrides;
  readonly tint: { readonly dark: string; readonly light: string };
  /** Mirrors the preset's flag; the saturation slider fades on this surface. */
  readonly achromatic?: true;
};

export const BASE_SURFACE_ID: SurfaceId = "orchid";

const SURFACE_IDS: readonly SurfaceId[] = ["orchid", "abyss", "canopy", "garnet", "sunset", "graphite", "lagoon"];

export const SURFACES: readonly Surface[] = SURFACE_IDS.map((id) => {
  const preset = getPreset(id as PalettePresetId);
  return {
    id,
    label: preset.name,
    ...(preset.achromatic ? { achromatic: true as const } : {}),
    tint: {
      dark: preset.swatch.dark[1] ?? preset.swatch.dark[0]!,
      light: preset.swatch.light[1] ?? preset.swatch.light[0]!,
    },
    overrides: preset.overrides,
  };
});

export function isSurface(value: string | null | undefined): value is SurfaceId {
  return SURFACES.some(({ id }) => id === value);
}

export function getSurface(value: string | null | undefined): Surface {
  return SURFACES.find(({ id }) => id === value) ?? SURFACES[0]!;
}

export const LEGACY_ACCENT_TO_SURFACE = {
  default: "orchid",
  blue: "abyss",
  green: "canopy",
  red: "garnet",
  amber: "sunset",
  neutral: "graphite",
  teal: "lagoon",
} as const;
