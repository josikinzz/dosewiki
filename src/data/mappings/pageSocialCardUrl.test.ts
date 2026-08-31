import { afterEach, describe, expect, it, vi } from "vitest";
// Dynamic imports are intentional: each flavor mock must exist before this build-time
// configuration module is evaluated.

const CARD_PATH_RE = /^https:\/\/dosewiki-media\.gremblinzuwu\.workers\.dev\/media\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}\.jpg$/;

afterEach(() => {
  vi.doUnmock("@/config/siteFlavor");
  vi.resetModules();
});

describe("pageSocialCardUrl", () => {
  it("returns immutable published URLs for every dose.wiki page card", async () => {
    vi.doMock("@/config/siteFlavor", () => ({ isEffectIndex: () => false }));
    const { PAGE_SOCIAL_CARD_KEYS, PAGE_SOCIAL_CARD_SIZE, pageSocialCardImage } =
      await import("./pageSocialCardUrl");

    expect(PAGE_SOCIAL_CARD_SIZE).toBe(1200);
    for (const key of PAGE_SOCIAL_CARD_KEYS) {
      expect(pageSocialCardImage(key, `${key} card`)).toMatchObject({
        path: expect.stringMatching(CARD_PATH_RE),
        width: 1200,
        height: 1200,
        alt: `${key} card`,
      });
    }
  });

  it("keeps Effect Index on its publication-wide social card", async () => {
    vi.doMock("@/config/siteFlavor", () => ({ isEffectIndex: () => true }));
    const { pageSocialCardImage, pageSocialCardUrl } = await import("./pageSocialCardUrl");

    expect(pageSocialCardUrl("home")).toBeNull();
    expect(pageSocialCardImage("effects", "Effect Index")).toBeUndefined();
  });
});
