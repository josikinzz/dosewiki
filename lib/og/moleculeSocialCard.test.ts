import sharp from "sharp";

import { renderMoleculeSocialCardPng } from "./moleculeSocialCard";

const TEXT_ONLY_MOLECULE = `<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="100px" viewBox="0 0 100 100">
  <style>text { font-family: sans-serif; }</style>
  <text x="20" y="75" stroke="none" font-weight="400" font-size="72" fill="#ff0000">N</text>
</svg>`;

const CARD_INPUT = {
  title: "2C-B",
  moleculeSvg: TEXT_ONLY_MOLECULE,
  psychoactiveClasses: ["Psychedelic", "Hallucinogen", "Entactogen (mild)"],
  chemicalClasses: ["2C-X", "Phenethylamine"],
} as const;

describe("renderMoleculeSocialCardPng", () => {
  it("renders the approved fixed-size flat card with bundled fonts", async () => {
    const png = await renderMoleculeSocialCardPng(CARD_INPUT);
    const { data, info } = await sharp(png)
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(info.width).toBe(1200);
    expect(info.height).toBe(1200);
    expect([...data.subarray(0, info.channels)]).toEqual([0, 0, 0, 255]);

    let redPixels = 0;
    let accentPixels = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      if (data[offset] > 180 && data[offset + 1] < 80 && data[offset + 2] < 80) {
        redPixels += 1;
      }
      if (data[offset] > 210 && data[offset + 1] > 100 && data[offset + 2] > 210) {
        accentPixels += 1;
      }
    }

    expect(redPixels).toBeGreaterThan(1_000);
    expect(accentPixels).toBeGreaterThan(4_000);
  });

  it("renders the dose.wiki wordmark without a trailing slash", async () => {
    const png = await renderMoleculeSocialCardPng(CARD_INPUT);
    const { data, info } = await sharp(png)
      .extract({ left: 310, top: 65, width: 20, height: 50 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    let trailingAccentPixels = 0;

    for (let offset = 0; offset < data.length; offset += info.channels) {
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      if (red > 170 && blue > 180 && blue > green + 20) {
        trailingAccentPixels += 1;
      }
    }

    expect(trailingAccentPixels).toBeLessThan(10);
  });

  it("renders a complete card for substances without molecule artwork", async () => {
    const png = await renderMoleculeSocialCardPng({
      ...CARD_INPUT,
      title: "Sentia",
      moleculeSvg: null,
    });

    await expect(sharp(png).metadata()).resolves.toMatchObject({
      format: "png",
      width: 1200,
      height: 1200,
    });
  });
});
