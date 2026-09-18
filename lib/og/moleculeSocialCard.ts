/**
 * Deterministic renderer for prebuilt dose.wiki substance social cards.
 *
 * Layer order is an invariant: flat background, optional molecule, then every
 * wordmark/title/classification element. Molecule artwork can therefore never
 * obscure the card's readable content.
 */
import path from "node:path";
import { readFileSync } from "node:fs";

import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

import { getCategoryIcon } from "../../src/data/config/categoryIcons";
import { SUBSTANCE_SOCIAL_CARD_SIZE } from "../../src/data/mappings/substanceSocialCardUrl";

export const SUBSTANCE_SOCIAL_CARD_RENDER_VERSION = "7";

const MOLECULE_BOX = 760;
const CARD_MARGIN = 72;
const BADGE_ROW_X = 124;
const BADGE_ROW_WIDTH = SUBSTANCE_SOCIAL_CARD_SIZE - BADGE_ROW_X - CARD_MARGIN;
const BADGE_HEIGHT = 54;
const PREFERRED_BADGE_FONT_SIZE = 27;
const MINIMUM_BADGE_FONT_SIZE = 14;
const PSYCHOACTIVE_ROW_Y = 1008;
const CHEMICAL_ROW_Y = 1080;

const FONT_DIR = path.join(process.cwd(), "public/fonts");
const FONT = {
  loadSystemFonts: false,
  fontFiles: [
    path.join(FONT_DIR, "Blinker-Regular.ttf"),
    path.join(FONT_DIR, "Blinker-SemiBold.ttf"),
  ],
  defaultFontFamily: "Blinker",
  sansSerifFamily: "Blinker",
};

const logoSvg = readFileSync(
  path.join(process.cwd(), "src/assets/dosewiki-logo.svg"),
  "utf8",
)
  .replace("#ff00ff", "#f0abfc")
  .replace("#8000ff", "#8b0fba");
const LOGO_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;

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

export type SubstanceSocialCardInput = {
  title: string;
  moleculeSvg: string | null;
  psychoactiveClasses: readonly string[];
  chemicalClasses: readonly string[];
};

const iconSetCache = new Map<string, IconifySet>();
const textWidthCache = new Map<string, number>();

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadIconSet(prefix: string): IconifySet {
  const cached = iconSetCache.get(prefix);
  if (cached) {
    return cached;
  }

  const iconSet = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "node_modules", "@iconify-json", prefix, "icons.json"),
      "utf8",
    ),
  ) as IconifySet;
  iconSetCache.set(prefix, iconSet);
  return iconSet;
}

function renderIcon(
  iconName: string,
  x: number,
  y: number,
  size: number,
  color = "#e3dae5",
): string {
  const separator = iconName.indexOf(":");
  if (separator <= 0) {
    throw new Error(`Invalid Iconify name: ${iconName}`);
  }
  const prefix = iconName.slice(0, separator);
  const name = iconName.slice(separator + 1);
  const iconSet = loadIconSet(prefix);
  const icon = iconSet.icons[name];
  if (!icon) {
    throw new Error(`Missing Iconify icon: ${iconName}`);
  }

  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 ${icon.width ?? iconSet.width ?? 24} ${icon.height ?? iconSet.height ?? 24}" color="${color}">${icon.body}</svg>`;
}

function measureText(text: string, fontSize: number, fontWeight: number): number {
  const cacheKey = `${fontWeight}:${fontSize}:${text}`;
  const cached = textWidthCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="5000" height="300"><text x="0" y="${fontSize * 1.2}" font-family="Blinker" font-size="${fontSize}" font-weight="${fontWeight}">${escapeXml(text)}</text></svg>`;
  const width = new Resvg(svg, { font: FONT }).getBBox()?.width ?? 0;
  textWidthCache.set(cacheKey, width);
  return width;
}

function fitSingleLineTitle(title: string): number {
  const preferredSize = 116;
  const minimumSize = 44;
  const maxWidth = SUBSTANCE_SOCIAL_CARD_SIZE - CARD_MARGIN * 2;
  const preferredWidth = measureText(title, preferredSize, 600);
  return preferredWidth <= maxWidth
    ? preferredSize
    : Math.max(minimumSize, (preferredSize * maxWidth) / preferredWidth);
}


type BadgeSpec = {
  label: string;
  iconName: string | null;
};

function badgeDimensions(spec: BadgeSpec, fontSize: number) {
  const scale = fontSize / PREFERRED_BADGE_FONT_SIZE;
  const paddingX = 18 * scale;
  const iconSize = spec.iconName ? 25 * scale : 0;
  const iconGap = spec.iconName ? 10 * scale : 0;
  const width =
    paddingX * 2 +
    iconSize +
    iconGap +
    measureText(spec.label, fontSize, 500);
  return { width, paddingX, iconSize, iconGap };
}

function badgeRowWidth(specs: readonly BadgeSpec[], fontSize: number): number {
  const badgeGap = 14 * (fontSize / PREFERRED_BADGE_FONT_SIZE);
  return specs.reduce(
    (total, spec, index) =>
      total + badgeDimensions(spec, fontSize).width + (index === 0 ? 0 : badgeGap),
    0,
  );
}

function fitBadgeFontSize(specs: readonly BadgeSpec[]): number {
  const preferredWidth = badgeRowWidth(specs, PREFERRED_BADGE_FONT_SIZE);
  if (preferredWidth <= BADGE_ROW_WIDTH) {
    return PREFERRED_BADGE_FONT_SIZE;
  }

  const fitted = PREFERRED_BADGE_FONT_SIZE * (BADGE_ROW_WIDTH / preferredWidth);
  const fontSize = Math.max(MINIMUM_BADGE_FONT_SIZE, fitted);
  if (badgeRowWidth(specs, fontSize) > BADGE_ROW_WIDTH + 1) {
    throw new Error(
      `Classification badges exceed the available row width at ${MINIMUM_BADGE_FONT_SIZE}px.`,
    );
  }
  return fontSize;
}

function renderBadge(spec: BadgeSpec, x: number, y: number, fontSize: number): string {
  const dimensions = badgeDimensions(spec, fontSize);
  const iconY = y + (BADGE_HEIGHT - dimensions.iconSize) / 2;
  const textX =
    x + dimensions.paddingX + dimensions.iconSize + dimensions.iconGap;
  const textBaseline = y + (BADGE_HEIGHT + fontSize * 0.7) / 2;

  return `<g>
    <rect x="${x}" y="${y}" width="${dimensions.width}" height="${BADGE_HEIGHT}" rx="12" fill="#180d1e" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>
    ${spec.iconName ? renderIcon(spec.iconName, x + dimensions.paddingX, iconY, dimensions.iconSize) : ""}
    <text x="${textX}" y="${textBaseline}" font-family="Blinker" font-size="${fontSize}" font-weight="500" fill="#e3dae5">${escapeXml(spec.label)}</text>
  </g>`;
}

function renderBadgeRow(specs: readonly BadgeSpec[], y: number): string {
  if (specs.length === 0) {
    return "";
  }

  const fontSize = fitBadgeFontSize(specs);
  const badgeGap = 14 * (fontSize / PREFERRED_BADGE_FONT_SIZE);
  let x = BADGE_ROW_X;
  return specs
    .map((spec) => {
      const svg = renderBadge(spec, x, y, fontSize);
      x += badgeDimensions(spec, fontSize).width + badgeGap;
      return svg;
    })
    .join("\n");
}

function renderMolecule(moleculeSvg: string): {
  png: Buffer;
  width: number;
  height: number;
} {
  let molecule = new Resvg(moleculeSvg, {
    background: "rgba(0,0,0,0)",
    font: FONT,
    fitTo: { mode: "width", value: MOLECULE_BOX },
  }).render();
  if (molecule.height > MOLECULE_BOX) {
    molecule = new Resvg(moleculeSvg, {
      background: "rgba(0,0,0,0)",
      font: FONT,
      fitTo: { mode: "height", value: MOLECULE_BOX },
    }).render();
  }
  return {
    png: molecule.asPng(),
    width: molecule.width,
    height: molecule.height,
  };
}

export async function renderMoleculeSocialCardPng({
  title,
  moleculeSvg,
  psychoactiveClasses,
  chemicalClasses,
}: SubstanceSocialCardInput): Promise<Buffer> {
  const psychoactiveBadges = psychoactiveClasses.map((label) => ({
    label,
    iconName: getCategoryIcon(
      label.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase(),
    ),
  }));
  const chemicalBadges = chemicalClasses.map((label) => ({
    label,
    iconName: null,
  }));
  const titleSize = fitSingleLineTitle(title);

  const backgroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SUBSTANCE_SOCIAL_CARD_SIZE}" height="${SUBSTANCE_SOCIAL_CARD_SIZE}"><rect width="100%" height="100%" fill="#000000"/></svg>`;
  const overlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SUBSTANCE_SOCIAL_CARD_SIZE}" height="${SUBSTANCE_SOCIAL_CARD_SIZE}">
    <image href="${LOGO_DATA_URI}" x="72" y="62" width="56" height="54"/>
    <text x="146" y="105" font-family="Blinker" font-size="43" font-weight="600" fill="#ffffff">dose<tspan fill="#f0abfc">.wiki</tspan></text>
    <text x="72" y="238" font-family="Blinker" font-size="${titleSize}" font-weight="600" letter-spacing="-1" fill="#f0abfc">${escapeXml(title)}</text>
    ${psychoactiveBadges.length > 0 ? renderIcon("lucide:brain-cog", 72, PSYCHOACTIVE_ROW_Y + 9, 36, "#f0abfc") : ""}
    ${renderBadgeRow(psychoactiveBadges, PSYCHOACTIVE_ROW_Y)}
    ${chemicalBadges.length > 0 ? renderIcon("lucide:flask-conical", 72, CHEMICAL_ROW_Y + 9, 36, "#f0abfc") : ""}
    ${renderBadgeRow(chemicalBadges, CHEMICAL_ROW_Y)}
  </svg>`;

  const layers: sharp.OverlayOptions[] = [];
  if (moleculeSvg) {
    const molecule = renderMolecule(moleculeSvg);
    layers.push({
      input: molecule.png,
      left: Math.round((SUBSTANCE_SOCIAL_CARD_SIZE - molecule.width) / 2),
      top: Math.round((SUBSTANCE_SOCIAL_CARD_SIZE - molecule.height) / 2 - 8),
    });
  }
  layers.push({
    input: new Resvg(overlaySvg, { font: FONT, textRendering: 2 }).render().asPng(),
    left: 0,
    top: 0,
  });

  const background = new Resvg(backgroundSvg).render().asPng();
  return await sharp(background).composite(layers).png().toBuffer();
}
