import { describe, expect, it } from "vitest";

import { stageRotation } from "./useStageFit";

describe("stageRotation", () => {
  it("offers rotate-to-fit for landscape motion on a portrait phone", () => {
    expect(
      stageRotation({
        portraitPhone: true,
        moving: true,
        mediaAspect: 16 / 9,
        mediaKey: "wide-loop",
        rotatedKey: null,
      }),
    ).toEqual({ canRotate: true, rotated: false });
  });

  it("rotates only while the reader's rotation names the active work", () => {
    expect(
      stageRotation({
        portraitPhone: true,
        moving: true,
        mediaAspect: 16 / 9,
        mediaKey: "wide-loop",
        rotatedKey: "wide-loop",
      }),
    ).toEqual({ canRotate: true, rotated: true });
  });

  it("resets rotation when navigating to a different work", () => {
    expect(
      stageRotation({
        portraitPhone: true,
        moving: true,
        mediaAspect: 16 / 9,
        mediaKey: "next-work",
        rotatedKey: "wide-loop",
      }),
    ).toEqual({ canRotate: true, rotated: false });
  });

  it("hides the control and un-rotates on media that is not landscape", () => {
    for (const mediaAspect of [9 / 16, 1]) {
      expect(
        stageRotation({
          portraitPhone: true,
          moving: true,
          mediaAspect,
          mediaKey: "tall-loop",
          rotatedKey: "tall-loop",
        }),
      ).toEqual({ canRotate: false, rotated: false });
    }
  });

  it("never offers rotation on desktop layouts or for still media", () => {
    expect(
      stageRotation({
        portraitPhone: false,
        moving: true,
        mediaAspect: 16 / 9,
        mediaKey: "wide-loop",
        rotatedKey: "wide-loop",
      }),
    ).toEqual({ canRotate: false, rotated: false });
    expect(
      stageRotation({
        portraitPhone: true,
        moving: false,
        mediaAspect: 16 / 9,
        mediaKey: "wide-still",
        rotatedKey: null,
      }),
    ).toEqual({ canRotate: false, rotated: false });
  });

  it("treats a degenerate aspect as not rotatable", () => {
    expect(
      stageRotation({
        portraitPhone: true,
        moving: true,
        mediaAspect: Number.NaN,
        mediaKey: "unsized",
        rotatedKey: null,
      }),
    ).toEqual({ canRotate: false, rotated: false });
  });
});
