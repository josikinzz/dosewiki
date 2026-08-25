import { readFileSync } from "node:fs";
import path from "node:path";

import { Resvg } from "@resvg/resvg-js";

export const SOCIAL_CARD_SIZE = 1200;

export const SOCIAL_CARD_COLORS = Object.freeze({
  background: "#000000",
  accent: "#f0abfc",
  accentStrong: "#df75f4",
  accentDark: "#8b0fba",
  text: "#ffffff",
  textMuted: "#c9c0cb",
  textFaint: "#938a96",
  surface: "#0d0b0e",
  surfaceSelected: "#28102f",
  border: "#332d35",
  borderSelected: "#9451a4",
});

const FONT_DIR = path.join(process.cwd(), "public/fonts");

export const SOCIAL_CARD_FONT = {
  loadSystemFonts: false,
  fontFiles: [
    path.join(FONT_DIR, "Blinker-Regular.ttf"),
    path.join(FONT_DIR, "Blinker-SemiBold.ttf"),
  ],
  defaultFontFamily: "Blinker",
  sansSerifFamily: "Blinker",
};

const doseWikiLogoSvg = readFileSync(
  path.join(process.cwd(), "src/assets/dosewiki-logo.svg"),
  "utf8",
)
  .replace("#ff00ff", SOCIAL_CARD_COLORS.accent)
  .replace("#8000ff", SOCIAL_CARD_COLORS.accentDark);

export const DOSEWIKI_LOGO_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(doseWikiLogoSvg).toString("base64")}`;

type IconifyIcon = {
  body: string;
  width?: number;
  height?: number;
};

type IconifySet = {
  icons: Record<string, IconifyIcon>;
  width?: number;
  height?: number;
};

const iconSetCache = new Map<string, IconifySet>();
const textWidthCache = new Map<string, number>();

export function escapeSocialCardXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadIconSet(prefix: string): IconifySet {
  const cached = iconSetCache.get(prefix);
  if (cached) return cached;

  const iconSet = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "node_modules", "@iconify-json", prefix, "icons.json"),
      "utf8",
    ),
  ) as IconifySet;
  iconSetCache.set(prefix, iconSet);
  return iconSet;
}

export function renderSocialCardIcon(
  iconName: string,
  x: number,
  y: number,
  size: number,
  color = SOCIAL_CARD_COLORS.accent,
): string {
  const separator = iconName.indexOf(":");
  if (separator <= 0) throw new Error(`Invalid Iconify name: ${iconName}`);

  const prefix = iconName.slice(0, separator);
  const name = iconName.slice(separator + 1);
  const iconSet = loadIconSet(prefix);
  const icon = iconSet.icons[name];
  if (!icon) throw new Error(`Missing Iconify icon: ${iconName}`);

  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 ${icon.width ?? iconSet.width ?? 24} ${icon.height ?? iconSet.height ?? 24}" color="${color}">${icon.body}</svg>`;
}

export function measureSocialCardText(
  text: string,
  fontSize: number,
  fontWeight = 400,
): number {
  const cacheKey = `${fontWeight}:${fontSize}:${text}`;
  const cached = textWidthCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="5000" height="300"><text x="0" y="${fontSize * 1.2}" font-family="Blinker" font-size="${fontSize}" font-weight="${fontWeight}">${escapeSocialCardXml(text)}</text></svg>`;
  const width = new Resvg(svg, { font: SOCIAL_CARD_FONT }).getBBox()?.width ?? 0;
  textWidthCache.set(cacheKey, width);
  return width;
}

export function fitSocialCardText(
  text: string,
  preferredSize: number,
  minimumSize: number,
  maxWidth: number,
  fontWeight = 600,
): number {
  const preferredWidth = measureSocialCardText(text, preferredSize, fontWeight);
  return preferredWidth <= maxWidth
    ? preferredSize
    : Math.max(minimumSize, (preferredSize * maxWidth) / preferredWidth);
}

export function renderDoseWikiWordmark(
  centerX: number,
  baselineY: number,
  fontSize: number,
  slash = false,
): string {
  const suffix = slash ? ".wiki/" : ".wiki";
  return `<text x="${centerX}" y="${baselineY}" text-anchor="middle" font-family="Blinker" font-size="${fontSize}" font-weight="600" letter-spacing="-1.5" fill="${SOCIAL_CARD_COLORS.text}">dose<tspan fill="${SOCIAL_CARD_COLORS.accent}">${suffix}</tspan></text>`;
}

export function renderSocialCardSvgPng(svg: string): Buffer {
  return Buffer.from(
    new Resvg(svg, {
      font: SOCIAL_CARD_FONT,
      textRendering: 2,
    })
      .render()
      .asPng(),
  );
}
