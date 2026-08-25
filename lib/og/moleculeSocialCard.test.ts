import sharp from "sharp";

import { renderMoleculeSocialCardPng } from "./moleculeSocialCard";

const TEXT_ONLY_MOLECULE = `<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="100px" viewBox="0 0 100 100">
  <style>text { font-family: sans-serif; }</style>
  <text x="20" y="75" stroke="none" font-weight="400" font-size="72" fill="#ff0000">N</text>
</svg>`;

describe("renderMoleculeSocialCardPng", () => {
  it("rasterizes SVG atom labels without relying on system fonts", async () => {
    const png = await renderMoleculeSocialCardPng(TEXT_ONLY_MOLECULE);
    const { data, info } = await sharp(png)
      .raw()
      .toBuffer({ resolveWithObject: true });

    let redPixels = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      if (data[offset] > 180 && data[offset + 1] < 80 && data[offset + 2] < 80) {
        redPixels += 1;
      }
    }

    expect(redPixels).toBeGreaterThan(1_000);
  });
});
