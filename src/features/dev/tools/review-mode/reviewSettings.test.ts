import { beforeEach, describe, expect, it } from "vitest";

// This suite runs in the node environment, so provide the minimal window +
// storage surface the settings helpers touch.
let store: Map<string, string>;
beforeEach(() => {
  store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
  };
});

import {
  crossedMilestone,
  loadReviewSettings,
  REVIEW_SETTINGS_DEFAULTS,
  saveReviewSettings,
} from "./reviewSettings";

describe("crossedMilestone", () => {
  it("reports the milestone a tick crosses", () => {
    expect(crossedMilestone(49, 50)).toBe(50);
    expect(crossedMilestone(99, 100)).toBe(100);
    expect(crossedMilestone(50, 51)).toBeNull();
    expect(crossedMilestone(120, 121)).toBeNull();
  });
});

describe("review settings persistence", () => {
  it("round-trips settings through storage", () => {
    saveReviewSettings({
      order: "home",
      unreviewedOnly: false,
      viewMode: "editor",
    });
    expect(loadReviewSettings()).toEqual({
      order: "home",
      unreviewedOnly: false,
      viewMode: "editor",
    });
  });

  it("falls back to defaults on garbage", () => {
    store.set(
      "dosewiki:review-workbench:v1",
      '{"order":"nonsense","viewMode":42}',
    );
    expect(loadReviewSettings()).toEqual(REVIEW_SETTINGS_DEFAULTS);
  });
});
