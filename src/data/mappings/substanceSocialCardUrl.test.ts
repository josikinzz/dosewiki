import { describe, expect, it } from "vitest";

import {
  SUBSTANCE_SOCIAL_CARD_SIZE,
  substanceSocialCardUrl,
} from "./substanceSocialCardUrl";

describe("substanceSocialCardUrl", () => {
  it("returns the build-generated immutable card path", () => {
    expect(substanceSocialCardUrl("2c-b")).toMatch(
      /^\/images\/social\/substances\/2c-b\.[a-f0-9]{16}\.jpg$/,
    );
    expect(SUBSTANCE_SOCIAL_CARD_SIZE).toBe(1200);
  });

  it("does not invent a card for an unknown slug", () => {
    expect(substanceSocialCardUrl("not-a-real-substance")).toBeNull();
  });
});
