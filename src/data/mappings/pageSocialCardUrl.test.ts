import { afterEach, describe, expect, it, vi } from "vitest";
// Dynamic imports are intentional: each flavor mock must exist before this build-time
// configuration module is evaluated.

const CARD_PATH_RE = /^(?:https:\/\/dosewiki-media\.gremblinzuwu\.workers\.dev\/media\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}|\/images\/social\/pages\/[a-z-]+\.[a-f0-9]{16})\.jpg$/;

afterEach(() => {
  vi.doUnmock("@/config/siteFlavor");
  vi.resetModules();
});

describe("pageSocialCardUrl", () => {
  it("returns content-addressed URLs for generated and published page cards", async () => {
    vi.doMock("@/config/siteFlavor", () => ({ isEffectIndex: () => false }));
    const { PAGE_SOCIAL_CARD_KEYS, pageSocialCardImage } =
      await import("./pageSocialCardUrl");

    for (const key of PAGE_SOCIAL_CARD_KEYS) {
      expect(pageSocialCardImage(key, `${key} card`)).toMatchObject({
        path: expect.stringMatching(CARD_PATH_RE),
        width: 1200,
        height: 1200,
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
