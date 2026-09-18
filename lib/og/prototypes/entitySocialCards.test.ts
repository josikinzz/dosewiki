import path from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { renderReplicationSocialCardPng } from "./replicationSocialCard";
import { renderSubjectiveEffectSocialCardPng } from "./subjectiveEffectSocialCard";
import { renderTripReportSocialCardPng } from "./tripReportSocialCard";
import { renderUserProfileSocialCardPng } from "./userProfileSocialCard";

const artworkPath = path.join(
  process.cwd(),
  "src/assets/replications-after-images-chelsea-morgan.webp",
);

async function expectSquarePng(buffer: Buffer) {
  const metadata = await sharp(buffer).metadata();
  expect(metadata).toMatchObject({ format: "png", width: 1200, height: 1200 });
}

describe("entity social-card renderers", () => {
  it("renders effect, replication, report, and avatar-free profile cards", async () => {
    const cards = await Promise.all([
      renderSubjectiveEffectSocialCardPng({
        name: "Geometry",
        slug: "geometry",
        iconName: "material-symbols:person-play-outline-rounded",
        summary: "A detailed subjective visual effect with structured patterns.",
        taxonomy: ["Sensory", "Visual"],
      }),
      renderReplicationSocialCardPng({
        slug: "after-images",
        recordId: "replication-test",
        title: "After images",
        creator: "Chelsea Morgan",
        effect: { name: "Tracers", slug: "tracers" },
        mediaType: "image",
        artworkPath,
        sourceUrl: "https://example.com/after-images",
        rights: { licenseName: "Rights remain with original creator" },
      }),
      renderTripReportSocialCardPng({
        title: "A careful evening",
        author: "Anonymous",
        substances: [{ name: "2C-B", dose: "15 mg", roa: "Oral" }],
        excerpt: "The first effects arrived gradually and remained manageable.",
        excerptContext: "T1:00 · Peak",
      }),
      renderUserProfileSocialCardPng({
        displayName: "Contributor",
        bioExcerpt: "Writes careful harm-reduction documentation.",
        roles: ["Reviewer"],
      }),
    ]);

    await Promise.all(cards.map(expectSquarePng));
  });

  it("renders a branded replication card when artwork is unavailable", async () => {
    const card = await renderReplicationSocialCardPng({
      slug: "missing-artwork",
      recordId: "replication-fallback-test",
      title: "Unavailable artwork",
      creator: "Original creator",
      effect: { name: "Geometry", slug: "geometry" },
      mediaType: "image",
      sourceUrl: "https://example.com/missing-artwork",
    });
    await expectSquarePng(card);

    const { data, info } = await sharp(card)
      .extract({ left: 72, top: 152, width: 1056, height: 594 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    let accentPixels = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      if (
        data[offset] > 60 &&
        data[offset + 2] > 70 &&
        data[offset + 2] > data[offset + 1]
      ) {
        accentPixels += 1;
      }
    }
    expect(accentPixels).toBeGreaterThan(1_000);
  });
});
