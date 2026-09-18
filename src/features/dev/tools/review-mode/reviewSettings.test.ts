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
      order: "sources",
      unreviewedOnly: false,
      viewMode: "editor",
      inlineEdit: true,
      groupByCategory: false,
      articleLinks: true,
      flagLabels: ["skinny", "missing citations"],
      flagSeverity: "major",
      flagGroupBy: "label",
    });
    expect(loadReviewSettings()).toEqual({
      order: "sources",
      unreviewedOnly: false,
      viewMode: "editor",
      inlineEdit: true,
      groupByCategory: false,
      articleLinks: true,
      flagLabels: ["skinny", "missing citations"],
      flagSeverity: "major",
      flagGroupBy: "label",
    });
  });

  it("leaves inline editing off when a stored session predates the setting", () => {
    store.set(
      "dosewiki:review-workbench:v2",
      JSON.stringify({ order: "home", unreviewedOnly: false, viewMode: "webpage" }),
    );
    expect(loadReviewSettings().inlineEdit).toBe(false);
    expect(loadReviewSettings().groupByCategory).toBe(true);
    expect(loadReviewSettings().articleLinks).toBe(false);
  });

  it("keeps a v1 session's preferences but resets it to the new default order", () => {
    store.set(
      "dosewiki:review-workbench:v1",
      JSON.stringify({
        order: "sources",
        unreviewedOnly: false,
        viewMode: "editor",
        inlineEdit: true,
      }),
    );
    expect(loadReviewSettings()).toEqual({
      ...REVIEW_SETTINGS_DEFAULTS,
      order: "home",
      unreviewedOnly: false,
      viewMode: "editor",
      inlineEdit: true,
      groupByCategory: true,
      articleLinks: false,
    });
  });

  it("prefers the v2 record once one exists", () => {
    store.set("dosewiki:review-workbench:v1", JSON.stringify({ order: "sources" }));
    store.set("dosewiki:review-workbench:v2", JSON.stringify({ order: "alpha" }));
    expect(loadReviewSettings().order).toBe("alpha");
  });

  it("resets a legacy unreviewed-only filter but keeps the rest of the record", () => {
    // Nearly every stored `true` was the pre-v3 default persisted incidentally,
    // so the migration drops it: ←/→ traverse everything until re-opted-in.
    store.set(
      "dosewiki:review-workbench:v2",
      JSON.stringify({ order: "alpha", unreviewedOnly: true, viewMode: "editor" }),
    );
    expect(loadReviewSettings()).toEqual({
      ...REVIEW_SETTINGS_DEFAULTS,
      order: "alpha",
      viewMode: "editor",
      unreviewedOnly: false,
    });
  });

  it("honours an unreviewed-only filter chosen after the v3 reset", () => {
    saveReviewSettings({ ...REVIEW_SETTINGS_DEFAULTS, unreviewedOnly: true });
    expect(store.has("dosewiki:review-workbench:v3")).toBe(true);
    expect(loadReviewSettings().unreviewedOnly).toBe(true);
  });

  it("falls back to defaults on garbage", () => {
    store.set(
      "dosewiki:review-workbench:v2",
      '{"order":"nonsense","viewMode":42}',
    );
    expect(loadReviewSettings()).toEqual(REVIEW_SETTINGS_DEFAULTS);
  });
});
