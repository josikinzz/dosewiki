import { describe, expect, it } from "vitest";

import {
  SUBSTANCE_SOCIAL_CARD_SIZE,
  substanceSocialCardUrl,
} from "./substanceSocialCardUrl";

describe("substanceSocialCardUrl", () => {
  it("returns the published immutable R2 card URL", () => {
    expect(substanceSocialCardUrl("2c-b")).toMatch(
      /^https:\/\/dosewiki-media\.gremblinzuwu\.workers\.dev\/media\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}\.jpg$/,
    );
    expect(SUBSTANCE_SOCIAL_CARD_SIZE).toBe(1200);
  });

  it("does not invent a card for an unknown slug", () => {
    expect(substanceSocialCardUrl("not-a-real-substance")).toBeNull();
  });
});
