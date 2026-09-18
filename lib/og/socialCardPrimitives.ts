import { readFileSync } from "node:fs";
import path from "node:path";

import { Resvg } from "@resvg/resvg-js";

export const SOCIAL_CARD_SIZE = 1200;

export const SOCIAL_CARD_COLORS = Object.freeze({
  // Resolved CSS tokens from the default Fun/dark theme. The card canvas stays
  // pure black by design; every foreground and Surface value mirrors the site.
  background: "#000000",
  accent: "#e7aeff",
  accentStrong: "#e494ff",
  accentMuted: "#a47bb9",
  text: "#ffffff",
  textSecondary: "#dcdcdc",
  textMuted: "#bbbbbb",
  textFaint: "#949494",
  tileLabelMuted: "#9b9b9b",
  surface: "#131313",
  surfaceHighlight: "#1a1a1a",
  surfaceSecondary: "#060606",
  controlSurface: "#171717",
  controlHighlight: "#1e1e1e",
  controlSecondary: "#0c0c0c",
  selectedHighlight: "#5d446e",
  selectedPrimary: "#4f3361",
  selectedSecondary: "#2b1c37",
  border: "#c7c7c729",
  controlBorder: "#c8c8c82e",
  borderSelected: "#e594ff75",
});

const FONT_DIR = path.join(process.cwd(), "public/fonts");

const SOCIAL_CARD_FONT = {
  loadSystemFonts: false,
  fontFiles: [
    path.join(FONT_DIR, "Blinker-Regular.ttf"),
    path.join(FONT_DIR, "Blinker-SemiBold.ttf"),
    // Noto Sans CJK SC Bold (SIL OFL), subset to the glyphs the /china card sets.
    path.join(FONT_DIR, "NotoSansCJKsc-Bold.china-card-subset.otf"),
  ],
  defaultFontFamily: "Blinker",
  sansSerifFamily: "Blinker",
}

/** Latin in Blinker, Han in the bundled Noto subset. */
export const SOCIAL_CARD_CJK_FONT_FAMILY = "Blinker, 'Noto Sans CJK SC'";

const doseWikiLogoSvg = readFileSync(
  path.join(process.cwd(), "src/assets/dosewiki-logo.svg"),
  "utf8",
)
  // The website paints this silhouette with --theme-logo-fill at 140% size
  // and 48% 50% position. SVG objectBoundingBox gradients resolve against the
  // tighter path box, so this calibrated vector reproduces the same visible
  // stop range rather than merely copying the CSS percentages.
  .replace(
    /<linearGradient\s+inkscape:collect="always"\s+xlink:href="#linearGradient36"[\s\S]*?\/>/,
    `<linearGradient id="linearGradient93" xlink:href="#linearGradient36" gradientUnits="objectBoundingBox" x1="-27.87%" y1="7.79%" x2="131.07%" y2="92.21%"/>`,
  )
  .replace(
    /<linearGradient\s+id="linearGradient36"[\s\S]*?<\/linearGradient>/,
    `<linearGradient id="linearGradient36">
      <stop stop-color="#e7aeff" offset="0"/>
      <stop stop-color="#d28ff3" offset="0.32"/>
      <stop stop-color="#bb71e1" offset="0.64"/>
      <stop stop-color="#a553cc" offset="1"/>
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
  color: string = SOCIAL_CARD_COLORS.accent,
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

export function renderSocialCardTypeLockup(
  label: string,
  iconName: string,
): string {
  const fontSize = 30;
  const fontWeight = 600;
  const iconSize = 34;
  const gap = 12;
  const right = SOCIAL_CARD_SIZE - 54;
  const labelWidth = measureSocialCardText(label, fontSize, fontWeight);
  const iconLeft = right - labelWidth - gap - iconSize;

  return `<g>
    ${renderSocialCardIcon(iconName, iconLeft, 56, iconSize, SOCIAL_CARD_COLORS.accentMuted)}
    <text x="${right}" y="88" text-anchor="end" font-family="Blinker" font-size="${fontSize}" font-weight="${fontWeight}" fill="${SOCIAL_CARD_COLORS.textSecondary}">${escapeSocialCardXml(label)}</text>
  </g>`;
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
