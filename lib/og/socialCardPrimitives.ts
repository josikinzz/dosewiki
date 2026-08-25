import { readFileSync } from "node:fs";
import path from "node:path";

import { Resvg } from "@resvg/resvg-js";

export const SOCIAL_CARD_SIZE = 1200;

export const SOCIAL_CARD_COLORS = Object.freeze({
  background: "#000000",
  // Resolved default Fun/dark tokens from the deployed site. Main headings and
  // page icons use accentStrong; selected app tiles use accent.
  accent: "#e7aeff",
  accentStrong: "#e494ff",
  accentMuted: "#a47bb9",
  text: "#ffffff",
  textMuted: "#c9c0cb",
  textFaint: "#938a96",
  surface: "#0d0b0e",
  selectedHighlight: "#5d446e",
  selectedPrimary: "#4f3361",
  selectedSecondary: "#2b1c37",
  border: "#332d35",
  borderSelected: "#e494ff75",
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
  // The website paints this silhouette with --theme-logo-fill. Rebuild the
  // source SVG's old two-stop horizontal gradient as that exact four-stop,
  // 118-degree default Fun/dark gradient for deterministic raster output.
  .replace(
    /<linearGradient\s+inkscape:collect="always"\s+xlink:href="#linearGradient36"[\s\S]*?\/>/,
    `<linearGradient id="linearGradient93" xlink:href="#linearGradient36" gradientUnits="objectBoundingBox" x1="5.85%" y1="26.55%" x2="94.15%" y2="73.45%"/>`,
  )
  .replace(
    /<linearGradient\s+id="linearGradient36"[\s\S]*?<\/linearGradient>/,
    `<linearGradient id="linearGradient36">
      <stop stop-color="#f0abfc" offset="0"/>
      <stop stop-color="#db8ce8" offset="0.32"/>
      <stop stop-color="#c56ed5" offset="0.64"/>
      <stop stop-color="#ae50bf" offset="1"/>
    </linearGradient>`,
  )
  .replace("stroke:url(#radialGradient43-6-72)", "stroke:url(#linearGradient93)");

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
  return `<text x="${centerX}" y="${baselineY}" text-anchor="middle" font-family="Blinker" font-size="${fontSize}" font-weight="600" letter-spacing="-1.5" fill="${SOCIAL_CARD_COLORS.text}">dose<tspan fill="${SOCIAL_CARD_COLORS.accentStrong}">${suffix}</tspan></text>`;
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
