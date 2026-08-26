import { describe, expect, it } from "vitest";

import {
  parseCarouselOrderBody,
  parseCarouselTargetRequest,
} from "./route";

describe("parseCarouselOrderBody", () => {
  it("accepts an exact collection order and deduplicates repeated slugs", () => {
    expect(
      parseCarouselOrderBody({
        targetKind: "substance",
        targetKey: "ketamine",
        slugs: ["still-work", "video-work", "still-work"],
        expectedUpdatedAt: "2026-08-25T10:00:00.000Z",
      }),
    ).toEqual({
      targetKind: "substance",
      targetKey: "ketamine",
      slugs: ["still-work", "video-work"],
      expectedOrder: undefined,
      expectedUpdatedAt: "2026-08-25T10:00:00.000Z",
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

  it("rejects oversized or malformed order arrays", () => {
    expect(() =>
      parseCarouselOrderBody({
        targetKind: "effect",
        targetKey: "tracers",
        slugs: Array.from({ length: 251 }, (_, index) => `work-${index}`),
      }),
    ).toThrow("at most 250");
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
