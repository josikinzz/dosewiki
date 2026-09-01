import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FALLBACK_IMAGE_RATIO,
  FALLBACK_VIDEO_RATIO,
  resolveMediaAspect,
  stageRotation,
  useStageFit,
} from "./useStageFit";

describe("resolveMediaAspect", () => {
  it("prefers a probed ratio over catalogued dimensions", () => {
    expect(resolveMediaAspect("video", 1600, 900, 4 / 3)).toBeCloseTo(4 / 3, 10);
  });
  it("falls back to catalogued dimensions when nothing was probed", () => {
    expect(resolveMediaAspect("image", 1200, 1600, undefined)).toBeCloseTo(3 / 4, 10);
  });
  it("guesses by type when the row carries no dimensions", () => {
    expect(resolveMediaAspect("video", undefined, undefined, undefined)).toBe(FALLBACK_VIDEO_RATIO);
    expect(resolveMediaAspect("image", null, null, undefined)).toBe(FALLBACK_IMAGE_RATIO);
  });
  it("ignores junk probes and junk dimensions", () => {
    expect(resolveMediaAspect("image", 1600, 900, Number.NaN)).toBeCloseTo(16 / 9, 10);
    expect(resolveMediaAspect("image", 1600, 900, 0)).toBeCloseTo(16 / 9, 10);
    expect(resolveMediaAspect("video", 0, 900, undefined)).toBe(FALLBACK_VIDEO_RATIO);
  });
});

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

describe("useStageFit", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("max-width: 767px"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rotates catalogued landscape work on the very first render — no post-mount flip", () => {
    const rotations: boolean[] = [];
    renderHook(() => {
      const fit = useStageFit({
        mediaKey: "wide-loop",
        type: "video",
        rotateMode: true,
        width: 1600,
        height: 900,
      });
      rotations.push(fit.rotated);
      return fit;
    });
    // The regression: portraitPhone used to seed false and flip in an
    // effect, painting one upright frame before snapping to rotated.
    expect(rotations[0]).toBe(true);
    expect(rotations.every(Boolean)).toBe(true);
  });

  it("marks catalogued dimensions as settled evidence immediately", () => {
    const { result } = renderHook(() =>
      useStageFit({
        mediaKey: "wide-loop",
        type: "video",
        rotateMode: true,
        width: 1600,
        height: 900,
      }),
    );
    expect(result.current.aspectSettled).toBe(true);
  });

  it("keeps a dimensionless work unsettled until the runtime probe lands", () => {
    const { result } = renderHook(() =>
      useStageFit({
        mediaKey: "legacy-row",
        type: "video",
        rotateMode: true,
        width: null,
        height: null,
      }),
    );
    // Guessed 16:9 would rotate, but it is not settled evidence yet.
    expect(result.current.aspectSettled).toBe(false);
    expect(result.current.rotated).toBe(true);

    // A portrait probe settles the work upright.
    act(() => result.current.probeAspect(900, 1600));
    expect(result.current.aspectSettled).toBe(true);
    expect(result.current.rotated).toBe(false);
  });
});
