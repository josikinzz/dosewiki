import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { PAGE_SOCIAL_CARD_KEYS } from "../../src/data/mappings/pageSocialCardUrl";
import { renderPageSocialCardPng } from "./pageSocialCard";

describe("renderPageSocialCardPng", () => {
  it.each(PAGE_SOCIAL_CARD_KEYS)("renders the %s card as a populated square PNG", async (key) => {
    const png = await renderPageSocialCardPng(key);
    const { data, info } = await sharp(png)
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(info.width).toBe(1200);
    expect(info.height).toBe(1200);

    let visiblePixels = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      if (data[offset] > 12 || data[offset + 1] > 12 || data[offset + 2] > 12) {
        visiblePixels += 1;
      }
    }
    expect(visiblePixels).toBeGreaterThan(20_000);
  });
});
