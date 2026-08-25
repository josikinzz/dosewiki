/**
 * Rasterizer for the square substance Open Graph card: the canonical molecule
 * SVG centered on a black base with a very subtle dark radial glow.
 *
 * Kept out of the route file so the composition stays a pure, testable
 * function — Next restricts what a `route.ts` module may export.
 */
import "server-only";
import path from "node:path";

import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { MOLECULE_SOCIAL_CARD_SIZE } from "../../src/data/mappings/moleculeOverrideUrl";

/** The molecule fits centered inside this square, leaving an even card margin. */
const MOLECULE_BOX = 880;

/** Bundled fallback for SVG atom labels; serverless runtimes have no system fonts. */
const MOLECULE_FONT_PATH = path.join(
  process.cwd(),
  "public/fonts/Blinker-Regular.ttf",
);

const MOLECULE_FONT = {
  loadSystemFonts: false,
  fontFiles: [MOLECULE_FONT_PATH],
  defaultFontFamily: "Blinker",
  sansSerifFamily: "Blinker",
};

const BACKGROUND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${MOLECULE_SOCIAL_CARD_SIZE}" height="${MOLECULE_SOCIAL_CARD_SIZE}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#1a1a1e"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="#000000"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
</svg>`;

/**
 * Render one already-recolored molecule SVG into the finished
 * {@link MOLECULE_SOCIAL_CARD_SIZE}² PNG card. Throws on unparseable SVG;
 * the route maps that to a 500 rather than serving a broken card.
 */
export async function renderMoleculeSocialCardPng(moleculeSvg: string): Promise<Buffer> {
  // Fit the molecule inside the box whichever way it overflows: scale to the
  // box width first, and if the result is still too tall, scale to height.
  let molecule = new Resvg(moleculeSvg, {
    background: "rgba(0,0,0,0)",
    font: MOLECULE_FONT,
    fitTo: { mode: "width", value: MOLECULE_BOX },
  }).render();
  if (molecule.height > MOLECULE_BOX) {
    molecule = new Resvg(moleculeSvg, {
      background: "rgba(0,0,0,0)",
      font: MOLECULE_FONT,
      fitTo: { mode: "height", value: MOLECULE_BOX },
    }).render();
  }

  const background = new Resvg(BACKGROUND_SVG).render().asPng();

  return await sharp(background)
    .composite([{ input: molecule.asPng(), gravity: "centre" }])
    .png()
    .toBuffer();
}
