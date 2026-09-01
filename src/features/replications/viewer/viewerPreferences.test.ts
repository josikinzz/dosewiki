import { describe, expect, it } from "vitest";

import {
  resolveViewerMuted,
  resolveViewerRotateMode,
  shouldShowGestureHint,
} from "./viewerPreferences";

describe("shouldShowGestureHint", () => {
  it("shows only on coarse pointers and only until first shown", () => {
    expect(shouldShowGestureHint(null, true)).toBe(true);
    expect(shouldShowGestureHint("seen", true)).toBe(false);
    expect(shouldShowGestureHint(null, false)).toBe(false);
  });
});

describe("resolveViewerMuted", () => {
  it("only unmutes for an explicit on preference", () => {
    expect(resolveViewerMuted("on")).toBe(false);
    expect(resolveViewerMuted("off")).toBe(true);
    expect(resolveViewerMuted(null)).toBe(true);
  });
});

describe("resolveViewerRotateMode", () => {
  it("only rotates for an explicit on preference", () => {
    expect(resolveViewerRotateMode("on")).toBe(true);
    expect(resolveViewerRotateMode("off")).toBe(false);
    expect(resolveViewerRotateMode(null)).toBe(false);
  });
});
