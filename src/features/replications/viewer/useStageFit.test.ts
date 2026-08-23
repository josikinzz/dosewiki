import { describe, expect, it } from "vitest";

import {
  PORTRAIT_PHONE_SCALE,
  PORTRAIT_PHONE_SCALE_LIMIT,
  portraitPhoneMediaScale,
} from "./useStageFit";

describe("portraitPhoneMediaScale", () => {
  it("slightly enlarges wide motion on portrait phones within the hard ceiling", () => {
    const scale = portraitPhoneMediaScale({
      moving: true,
      mediaAspect: 16 / 9,
      portraitPhone: true,
      fullFrame: false,
    });
    expect(scale).toBe(PORTRAIT_PHONE_SCALE);
    expect(scale).toBeLessThanOrEqual(PORTRAIT_PHONE_SCALE_LIMIT);
  });

  it("shows the whole frame when the reader requests Full frame", () => {
    expect(
      portraitPhoneMediaScale({
        moving: true,
        mediaAspect: 16 / 9,
        portraitPhone: true,
        fullFrame: true,
      }),
    ).toBe(1);
  });

  it("never enlarges desktop, still, portrait, or square media", () => {
    const cases = [
      {
        moving: true,
        mediaAspect: 16 / 9,
        portraitPhone: false,
        fullFrame: false,
      },
      {
        moving: false,
        mediaAspect: 16 / 9,
        portraitPhone: true,
        fullFrame: false,
      },
      {
        moving: true,
        mediaAspect: 9 / 16,
        portraitPhone: true,
        fullFrame: false,
      },
      { moving: true, mediaAspect: 1, portraitPhone: true, fullFrame: false },
    ];
    for (const options of cases)
      expect(portraitPhoneMediaScale(options)).toBe(1);
  });
});
