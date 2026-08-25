import { describe, expect, it } from "vitest";

import { stageRotation } from "./useStageFit";

describe("stageRotation", () => {
  it("offers the rotate-mode toggle on every portrait-phone layout", () => {
    expect(
      stageRotation({
        portraitPhone: true,
        rotateMode: false,
        mediaAspect: 16 / 9,
      }),
    ).toEqual({ canRotate: true, rotated: false });
    // Even on an upright work: the sticky mode must stay reachable.
    expect(
      stageRotation({
        portraitPhone: true,
        rotateMode: true,
        mediaAspect: 9 / 16,
      }).canRotate,
    ).toBe(true);
  });

  it("rotates landscape works while rotate mode is on", () => {
    expect(
      stageRotation({
        portraitPhone: true,
        rotateMode: true,
        mediaAspect: 16 / 9,
      }),
    ).toEqual({ canRotate: true, rotated: true });
  });

  it("lands portrait and square works upright while the mode holds", () => {
    for (const mediaAspect of [9 / 16, 1]) {
      expect(
        stageRotation({
          portraitPhone: true,
          rotateMode: true,
          mediaAspect,
        }),
      ).toEqual({ canRotate: true, rotated: false });
    }
  });

  it("never rotates or offers the toggle outside the portrait phone layout", () => {
    expect(
      stageRotation({
        portraitPhone: false,
        rotateMode: true,
        mediaAspect: 16 / 9,
      }),
    ).toEqual({ canRotate: false, rotated: false });
  });

  it("treats a degenerate aspect as not rotatable", () => {
    expect(
      stageRotation({
        portraitPhone: true,
        rotateMode: true,
        mediaAspect: Number.NaN,
      }),
    ).toEqual({ canRotate: true, rotated: false });
  });
});
