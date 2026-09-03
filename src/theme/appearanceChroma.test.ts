import { describe, expect, it, vi } from "vitest";
import {
  ACCENT_HUE_PROPERTY,
  ACCENT_LEVEL_PROPERTY,
  CHROMA_STYLESHEET_LINK_ID,
  CHROMA_SUPPORT_PROBE,
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

  it("disengages, and leaves the root disengaged, in a browser that cannot parse the sheet", () => {
    // Safari 16.4 to 17.x types the relative-colour h channel as an angle, so the sheet's
    // calc(h + shift) sums are invalid there; 16.3 and older lack the syntax. Engaging would
    // turn every rewritten token invalid and blank the accent, logo and panels, so the
    // writer asks CSS.supports for the exact grammar the sheet is built from and stays off
    // when the answer is no: no attribute, no properties, no stylesheet link.
    const root = document.documentElement;
    document.head.innerHTML = "";
    const supports = vi.spyOn(CSS, "supports").mockImplementation(
      (property: string, value?: string) => !(property === "color" && value === CHROMA_SUPPORT_PROBE),
    );

    try {
      root.dataset.chroma = "";
      root.style.setProperty(SURFACE_LEVEL_PROPERTY, "0.5");

      applyChromaToDocument(0.35, 1, 40, 300);

      expect(supports).toHaveBeenCalledWith("color", CHROMA_SUPPORT_PROBE);
      expect(root.dataset.chroma).toBeUndefined();
      for (const property of [
        SURFACE_LEVEL_PROPERTY,
        ACCENT_LEVEL_PROPERTY,
        SURFACE_HUE_PROPERTY,
        ACCENT_HUE_PROPERTY,
      ]) {
        expect(root.style.getPropertyValue(property), property).toBe("");
      }
      expect(document.getElementById(CHROMA_STYLESHEET_LINK_ID)).toBeNull();
    } finally {
      supports.mockRestore();
      delete root.dataset.chroma;
      root.style.removeProperty(SURFACE_LEVEL_PROPERTY);
    }
  });
});
