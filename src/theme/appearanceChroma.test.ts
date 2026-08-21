import { describe, expect, it } from "vitest";
import {
  ACCENT_HUE_PROPERTY,
  ACCENT_LEVEL_PROPERTY,
  CHROMA_STYLESHEET_LINK_ID,
  SURFACE_HUE_PROPERTY,
  SURFACE_LEVEL_PROPERTY,
  applyChromaToDocument,
  parseHueDegrees,
} from "./appearanceChroma";

describe("colour axis runtime helpers", () => {
  it("reads a stored hue as an integer degree count in 0..359, null otherwise", () => {
    // The provider and the bootstrap must agree on this grammar; the bootstrap
    // inlines it, and `index.test.ts` asserts the inlined copy against these
    // same garbage cases.
    expect(parseHueDegrees("0")).toBe(0);
    expect(parseHueDegrees("40")).toBe(40);
    expect(parseHueDegrees("359")).toBe(359);
    expect(parseHueDegrees("007")).toBe(7);
    for (const garbage of [null, "", "360", "-20", "1.5", "40px", "abc"]) {
      expect(parseHueDegrees(garbage), String(garbage)).toBeNull();
    }
  });

  it("writes and clears hue properties alongside the levels, disengaging only when all four are locked", () => {
    const root = document.documentElement;
    document.head.innerHTML = "";

    try {
      applyChromaToDocument(0.35, 1, 40, 300);
      expect(root.dataset.chroma).toBe("");
      expect(root.style.getPropertyValue(SURFACE_LEVEL_PROPERTY)).toBe("0.35");
      expect(root.style.getPropertyValue(ACCENT_LEVEL_PROPERTY)).toBe("1");
      expect(root.style.getPropertyValue(SURFACE_HUE_PROPERTY)).toBe("40");
      expect(root.style.getPropertyValue(ACCENT_HUE_PROPERTY)).toBe("300");
      expect(document.getElementById(CHROMA_STYLESHEET_LINK_ID)).toBeInstanceOf(HTMLLinkElement);

      // One locked axis clears its own properties and leaves the other engaged.
      applyChromaToDocument(null, 0.8, null, 120);
      expect(root.dataset.chroma).toBe("");
      expect(root.style.getPropertyValue(SURFACE_LEVEL_PROPERTY)).toBe("");
      expect(root.style.getPropertyValue(SURFACE_HUE_PROPERTY)).toBe("");
      expect(root.style.getPropertyValue(ACCENT_LEVEL_PROPERTY)).toBe("0.8");
      expect(root.style.getPropertyValue(ACCENT_HUE_PROPERTY)).toBe("120");
      // Idempotence: the first call created the link; re-applying must not duplicate
      // it — the same guard that keeps the bootstrap off the server-rendered copy.
      expect(document.querySelectorAll(`link#${CHROMA_STYLESHEET_LINK_ID}`)).toHaveLength(1);

      // All four locked (Effect Index): the axes disengage entirely.
      applyChromaToDocument(null, null, null, null);
      expect(root.dataset.chroma).toBeUndefined();
      expect(root.style.getPropertyValue(ACCENT_LEVEL_PROPERTY)).toBe("");
      expect(root.style.getPropertyValue(ACCENT_HUE_PROPERTY)).toBe("");
    } finally {
      document.getElementById(CHROMA_STYLESHEET_LINK_ID)?.remove();
      delete root.dataset.chroma;
      root.style.removeProperty(SURFACE_LEVEL_PROPERTY);
      root.style.removeProperty(ACCENT_LEVEL_PROPERTY);
      root.style.removeProperty(SURFACE_HUE_PROPERTY);
      root.style.removeProperty(ACCENT_HUE_PROPERTY);
    }
  });
});
