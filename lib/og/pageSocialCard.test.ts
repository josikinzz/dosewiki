import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { PAGE_SOCIAL_CARD_KEYS } from "../../src/data/mappings/pageSocialCardUrl";
import { renderPageSocialCardPng } from "./pageSocialCard";

const replicationCounts = { total: 6634, artists: 1539, effects: 103, images: 5786, videos: 848 };

describe("renderPageSocialCardPng", () => {
  it.each(PAGE_SOCIAL_CARD_KEYS)("renders the %s card as a populated square PNG", async (key) => {
    const png = await renderPageSocialCardPng(key, replicationCounts);
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

  it.each(PAGE_SOCIAL_CARD_KEYS)(
    "brands the %s card in the top-left corner",
    async (key) => {
      const png = await renderPageSocialCardPng(key, replicationCounts);
      const { data, info } = await sharp(png)
        .extract({ left: 54, top: 45, width: 230, height: 58 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      let accentPixels = 0;
      let whitePixels = 0;

      for (let offset = 0; offset < data.length; offset += info.channels) {
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        if (red > 150 && blue > 180 && blue > green + 20) {
          accentPixels += 1;
        }
        if (red > 180 && green > 180 && blue > 180) {
          whitePixels += 1;
        }
      }

      expect(accentPixels).toBeGreaterThan(500);
      expect(whitePixels).toBeGreaterThan(300);
    },
  );

  it("features the selected replication above its compact navigation", async () => {
    const png = await renderPageSocialCardPng("replications", replicationCounts);
    const { data, info } = await sharp(png)
      .extract({ left: 108, top: 308, width: 984, height: 553 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    let photographicPixels = 0;

    for (let offset = 0; offset < data.length; offset += info.channels) {
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      if (
        Math.max(red, green, blue) > 60 &&
        Math.max(red, green, blue) - Math.min(red, green, blue) > 12
      ) {
        photographicPixels += 1;
      }
    }

    expect(photographicPixels).toBeGreaterThan(300_000);
  });

  it("matches the default website gradient across the dose.wiki logo", async () => {
    const png = await renderPageSocialCardPng("home");
    const { data, info } = await sharp(png)
      .extract({ left: 495, top: 72, width: 210, height: 210 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const sums = [0, 0, 0];
    let logoPixels = 0;

    for (let offset = 0; offset < data.length; offset += info.channels) {
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      if (red > 100 && blue > red && blue > green + 25 && red > green + 20) {
        sums[0] += red;
        sums[1] += green;
        sums[2] += blue;
        logoPixels += 1;
      }
    }

    expect(logoPixels).toBeGreaterThan(15_000);
    expect(sums[0] / logoPixels).toBeGreaterThan(190);
    expect(sums[0] / logoPixels).toBeLessThan(196);
    expect(sums[1] / logoPixels).toBeGreaterThan(122);
    expect(sums[1] / logoPixels).toBeLessThan(128);
    expect(sums[2] / logoPixels).toBeGreaterThan(224);
    expect(sums[2] / logoPixels).toBeLessThan(230);
  });
});
