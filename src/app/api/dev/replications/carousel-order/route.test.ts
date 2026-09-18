import { describe, expect, it } from "vitest";

import {
  parseCarouselOrderBody,
  parseCarouselTargetRequest,
} from "./carouselOrderRequest";

describe("parseCarouselOrderBody", () => {
  it("accepts an exact collection order and deduplicates repeated slugs", () => {
    expect(
      parseCarouselOrderBody({
        targetKind: "substance",
        targetKey: "ketamine",
        slugs: ["still-work", "video-work", "still-work"],
        expectedUpdatedAt: "2026-08-25T10:00:00.000Z",
        expectedRevision: "a".repeat(64),
      }),
    ).toEqual({
      targetKind: "substance",
      targetKey: "ketamine",
      slugs: ["still-work", "video-work"],
      expectedOrder: undefined,
      expectedUpdatedAt: "2026-08-25T10:00:00.000Z",
      expectedRevision: "a".repeat(64),
    });
  });

  it("rejects gallery scopes and malformed target keys", () => {
    expect(() =>
      parseCarouselOrderBody({
        targetKind: "gallery",
        targetKey: "replications",
        slugs: [],
      }),
    ).toThrow("targetKind must be artist, effect, or substance");
    expect(() =>
      parseCarouselOrderBody({
        targetKind: "artist",
        targetKey: "Chelsea Morgan",
        slugs: [],
      }),
    ).toThrow("valid collection target key");
  });

  it("accepts a complete article order above the membership-edit limit", () => {
    const slugs = Array.from({ length: 2025 }, (_, index) => `work-${index}`).reverse();
    expect(parseCarouselOrderBody({
      targetKind: "effect", targetKey: "drifting", slugs,
      expectedOrder: [...slugs].reverse(), expectedRevision: "a".repeat(64),
    }).slugs).toEqual(slugs);
  });

  it("rejects malformed order arrays", () => {
    expect(() =>
      parseCarouselOrderBody({
        targetKind: "effect",
        targetKey: "tracers",
        slugs: ["Not a slug"],
      }),
    ).toThrow("Every slugs entry");
  });
});

describe("parseCarouselTargetRequest", () => {
  it("reads a named viewer target from the query string", () => {
    expect(
      parseCarouselTargetRequest(
        new Request(
          "https://dosewiki-admin.vercel.app/api/dev/replications/carousel-order?targetKind=artist&targetKey=chelsea-morgan",
        ),
      ),
    ).toEqual({ targetKind: "artist", targetKey: "chelsea-morgan" });
  });

  it("refuses unnamed gallery collections", () => {
    expect(() =>
      parseCarouselTargetRequest(
        new Request(
          "https://dosewiki-admin.vercel.app/api/dev/replications/carousel-order?targetKind=gallery&targetKey=replications",
        ),
      ),
    ).toThrow("targetKind must be artist, effect, or substance");
  });
});
