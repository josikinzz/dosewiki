import { SITE_FLAVOR_CONFIG, isEffectIndex, type SiteFlavorConfig } from "../../config/siteFlavor";
import type { ColorScheme } from "../../theme";

export const EFFECT_INDEX_MOLECULE_PALETTES = {
  light: {
    carbon: "#333333",
    nitrogen: "#2f4a8f",
    oxygen: "#b0413e",
    sulfur: "#9a7d20",
    phosphorus: "#b06a2c",
    fluorine: "#4a8f6f",
    chlorine: "#3d7d52",
    bromine: "#8a4230",
    iodine: "#6a4b8f",
    rGroup: "#3d9991",
    surface: "#f6f5f1",
  },
  dark: {
    carbon: "#f2f2f0",
    nitrogen: "#91aef2",
    oxygen: "#ef8580",
    sulfur: "#d8bc5d",
    phosphorus: "#e2a06b",
    fluorine: "#8ed0b2",
    chlorine: "#7fc495",
    bromine: "#d78a72",
    iodine: "#b9a0df",
    rGroup: "#6fc4bb",
    surface: "#131313",
  },
} as const satisfies Record<ColorScheme, Record<string, string>>;

type EffectIndexMoleculeColorKey = keyof (typeof EFFECT_INDEX_MOLECULE_PALETTES)["light"]
export type MoleculeColorway = "brand" | "pro-light" | "pro-dark";

const SOURCE_HEX_TO_COLOR_KEY: Readonly<Record<string, EffectIndexMoleculeColorKey>> = {
  f0abfc: "carbon",
  c4b5fd: "nitrogen",
  fda4af: "oxygen",
  fbbf24: "fluorine",
  bef264: "sulfur",
  "6ee7b7": "chlorine",
  fb7185: "bromine",
  e879f9: "iodine",
  c084fc: "rGroup",
  eef2ff: "surface",
  a5b4fc: "nitrogen",
  f43f5e: "oxygen",
  fcd34d: "sulfur",

  "000000": "carbon",
  "0000ff": "nitrogen",
  ff0000: "oxygen",
  "33cccc": "fluorine",
  ff7f00: "phosphorus",
  cccc00: "sulfur",
  "00cc00": "chlorine",
  "7f4c19": "bromine",
  a01eef: "iodine",
  ffffff: "surface",

  f5d0fe: "carbon",
  "333333": "carbon",
  "333399": "nitrogen",
  "009900": "chlorine",
  "996600": "fluorine",
  "666600": "sulfur",
  "666633": "sulfur",
  "660099": "iodine",
  "663333": "bromine",
  ec0000: "bromine",
  "660000": "oxygen",
};

const SOURCE_HEX_EXCEPTIONS: Readonly<
  Record<string, { key: EffectIndexMoleculeColorKey; alpha: string }>
> = {
  "666633": { key: "sulfur", alpha: "cc" },
  ffffff99: { key: "carbon", alpha: "99" },
};

const NAMED_COLOR_TO_COLOR_KEY: Readonly<Record<string, EffectIndexMoleculeColorKey>> = {
  black: "carbon",
  red: "oxygen",
  white: "surface",
};

const HEX_TOKEN_RE = /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![0-9a-f])/gi;

const RGB_TOKEN_RE = /rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/gi;

const NAMED_COLOR_RE = new RegExp(
  String.raw`\b(fill|stroke|color|stop-color|flood-color|lighting-color)(\s*[:=]\s*["']?)(` +
    Object.keys(NAMED_COLOR_TO_COLOR_KEY).join("|") +
    String.raw`)\b`,
  "gi",
);

function expandShorthandHex(digits: string): string {
  if (digits.length !== 3 && digits.length !== 4) {
    return digits;
  }
  return digits
    .split("")
    .map((digit) => digit + digit)
    .join("");
}

function paletteHex(key: EffectIndexMoleculeColorKey, colorScheme: ColorScheme): string {
  return EFFECT_INDEX_MOLECULE_PALETTES[colorScheme][key];
}

function resolveHexDigits(rawDigits: string, colorScheme: ColorScheme): string | null {
  const digits = expandShorthandHex(rawDigits.toLowerCase());

  const exception = SOURCE_HEX_EXCEPTIONS[digits];
  if (exception) {
    return `${paletteHex(exception.key, colorScheme)}${exception.alpha}`;
  }

  const direct = SOURCE_HEX_TO_COLOR_KEY[digits];
  if (direct) {
    return paletteHex(direct, colorScheme);
  }

  if (digits.length === 8) {
    const mapped = SOURCE_HEX_TO_COLOR_KEY[digits.slice(0, 6)];
    return mapped ? `${paletteHex(mapped, colorScheme)}${digits.slice(6)}` : null;
  }

  return null;
}

function toHexDigits(r: number, g: number, b: number): string | null {
  if (r > 255 || g > 255 || b > 255) {
    return null;
  }
  return [r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("");
}

const CHANNEL_ELEMENT_RE = /<(mask|clipPath)\b[\s\S]*?<\/\1\s*>/gi;

export function recolorMoleculeSvgToEffectIndex(
  svg: string,
  colorScheme: ColorScheme = "light",
): string {
  const slices: string[] = [];
  let cursor = 0;
  for (const block of svg.matchAll(CHANNEL_ELEMENT_RE)) {
    slices.push(svg.slice(cursor, block.index), block[0]);
    cursor = block.index + block[0].length;
  }
  slices.push(svg.slice(cursor));

  return slices
    .map((slice, index) =>
      index % 2 === 1
        ? slice
        : slice
            .replace(HEX_TOKEN_RE, (match, digits: string) =>
              resolveHexDigits(digits, colorScheme) ?? match)
            .replace(RGB_TOKEN_RE, (match, r: string, g: string, b: string) => {
              const digits = toHexDigits(Number(r), Number(g), Number(b));
              if (!digits) {
                return match;
              }
              return resolveHexDigits(digits, colorScheme) ?? match;
            })
            .replace(
              NAMED_COLOR_RE,
              (match, property: string, separator: string, name: string) => {
                const key = NAMED_COLOR_TO_COLOR_KEY[name.toLowerCase()];
                return key ? `${property}${separator}${paletteHex(key, colorScheme)}` : match;
              },
            ),
    )
    .join("");
}

export function resolveMoleculeColorway(
  requested: string | null,
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
): MoleculeColorway {
  if (requested === "pro-light" || requested === "pro-dark") {
    return requested;
  }
  return isEffectIndex(config) ? "pro-light" : "brand";
}

export function applyMoleculeColorway(svg: string, colorway: MoleculeColorway): string {
  if (colorway === "brand") {
    return svg;
  }
  return recolorMoleculeSvgToEffectIndex(
    svg,
    colorway === "pro-dark" ? "dark" : "light",
  );
}

export const RECOLORABLE_MOLECULE_HEXES: readonly string[] = Object.freeze([
  ...Object.keys(SOURCE_HEX_TO_COLOR_KEY),
  ...Object.keys(SOURCE_HEX_EXCEPTIONS),
].map((digits) => `#${digits}`));

export const BRAND_MOLECULE_HEXES: readonly string[] = Object.freeze([
  "#f0abfc",
  "#c4b5fd",
  "#fda4af",
  "#fbbf24",
  "#bef264",
  "#6ee7b7",
  "#fb7185",
  "#e879f9",
  "#c084fc",
  "#eef2ff",
  "#a5b4fc",
  "#f43f5e",
  "#fcd34d",
  "#f5d0fe",
]);

