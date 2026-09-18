import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CORNER_STEPS,
  CORNER_TOKEN_IDS,
  DEPTH_STEPS,
  DEPTH_TOKEN_IDS,
  GLOW_STEPS,
  GLOW_TOKEN_IDS,
  cornerOverrides,
  depthOverrides,
  detectStep,
  fadeColorsIn,
  glowOverrides,
} from "./flatnessAxes";
import { BLUR_TOKEN_ID, blurDisabledIn } from "./themeLabStorage";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SITE_COLORS = fs.readFileSync(path.join(REPO_ROOT, "src/styles/site-colors.css"), "utf8");

describe("flatness axes", () => {
  it("scales every alpha spelling the theme uses", () => {
    expect(fadeColorsIn("0 1px 3px 0 rgb(2 6 23 / 0.1)", 0.5)).toBe("0 1px 3px 0 rgb(2 6 23 / 0.05)");
    expect(fadeColorsIn("oklch(46% 0.12 318 / 0.06)", 0.5)).toBe("oklch(46% 0.12 318 / 0.03)");
    expect(fadeColorsIn("rgba(126, 34, 206, 0.13)", 0.5)).toBe("rgba(126, 34, 206, 0.065)");
    expect(fadeColorsIn("rgb(2 6 23 / 12%)", 0.5)).toBe("rgb(2 6 23 / 6%)");
    expect(
      fadeColorsIn("0 22px 45px -28px color-mix(in srgb, rgb(1 2 3) 60%, transparent)", 0.5),
    ).toBe("0 22px 45px -28px color-mix(in srgb, rgb(1 2 3) 30%, transparent)");
  });

  it("leaves geometry and non-alpha numbers alone", () => {
    const value = "0 10px 15px -3px rgb(2 6 23 / 0.1), 0 4px 6px -4px rgb(2 6 23 / 0.1)";
    const faded = fadeColorsIn(value, 0.5);
    expect(faded).toContain("0 10px 15px -3px");
    expect(faded).toContain("0 4px 6px -4px");
    expect(faded.match(/0\.05\)/g)).toHaveLength(2);
  });

  it("flattens every depth token to no-shadow at factor 0", () => {
    const map = depthOverrides(() => "0 10px 30px -12px rgb(2 6 23 / 0.5)", 0);
    expect(Object.keys(map).sort()).toEqual([...DEPTH_TOKEN_IDS].sort());
    for (const value of Object.values(map)) expect(value).toBe("0 0 #0000");
  });

  it("wraps an opaque shadow color in a color-mix fade instead of leaving it", () => {
    const map = depthOverrides(() => "0 10px 30px -12px rgb(2 6 23)", 0.5);
    expect(map[DEPTH_TOKEN_IDS[0]]).toBe(
      "0 10px 30px -12px color-mix(in srgb, rgb(2 6 23) 50%, transparent)",
    );
  });

  it("turns glows transparent at factor 0 and fades them otherwise", () => {
    const off = glowOverrides(() => "rgba(126, 34, 206, 0.13)", 0);
    for (const id of GLOW_TOKEN_IDS) expect(off[id]).toBe("transparent");
    const faint = glowOverrides(() => "rgba(126, 34, 206, 0.13)", 0.4);
    for (const id of GLOW_TOKEN_IDS) expect(faint[id]).toBe("rgba(126, 34, 206, 0.052)");
  });

  it("round-trips step detection for every non-default step", () => {
    const baseline = (id: string) => `0 4px 8px 0 rgb(2 6 23 / 0.2) /* ${id} */`;
    for (const step of DEPTH_STEPS.filter((s) => s.factor !== null)) {
      const written = depthOverrides(baseline, step.factor as number);
      expect(
        detectStep(DEPTH_STEPS, DEPTH_TOKEN_IDS, (id) => written[id], baseline, depthOverrides),
      ).toBe(step.id);
    }
    // No overrides at all = the default step.
    expect(
      detectStep(DEPTH_STEPS, DEPTH_TOKEN_IDS, () => undefined, baseline, depthOverrides),
    ).toBe("default");
    // A stray manual edit = no step claims the axis.
    expect(
      detectStep(
        DEPTH_STEPS,
        DEPTH_TOKEN_IDS,
        (id) => (id === DEPTH_TOKEN_IDS[0] ? "0 0 #0000" : undefined),
        baseline,
        depthOverrides,
      ),
    ).toBeNull();
  });

  it("detects a step when the theme already ships some depth tokens flat", () => {
    // A partly flat baseline is the ordinary case, not an exotic one: every light
    // scheme authors the avatar elevations as `0 0 #0000`, and Pro authors its
    // control, icon-tile and frosted-panel elevations that way too, while the rest
    // of the family carries real shadows. The write path's delete-on-equal rule
    // stores nothing for those tokens — a flat shadow fades to itself at every
    // factor — so detection has to read that gap as a match, or no chip ever
    // highlights the step the visitor just tapped.
    const alreadyFlat = DEPTH_TOKEN_IDS.filter((id) =>
      new RegExp(`^\\s*${id}:\\s*0 0 #0000;`, "m").test(SITE_COLORS),
    );
    expect(alreadyFlat.length).toBeGreaterThan(0);
    expect(alreadyFlat.length).toBeLessThan(DEPTH_TOKEN_IDS.length);
    const baseline = (id: string) =>
      alreadyFlat.includes(id) ? "0 0 #0000" : "0 4px 8px 0 rgb(2 6 23 / 0.2)";

    for (const step of DEPTH_STEPS.filter((s) => s.factor !== null)) {
      const computed = depthOverrides(baseline, step.factor as number);
      // Simulate delete-on-equal: entries equal to the baseline are dropped.
      const stored = Object.fromEntries(
        Object.entries(computed).filter(([id, value]) => value.trim() !== baseline(id).trim()),
      );
      // The scenario is real: some tokens must actually have been dropped.
      expect(Object.keys(stored).length).toBeLessThan(Object.keys(computed).length);
      expect(
        detectStep(DEPTH_STEPS, [...DEPTH_TOKEN_IDS], (id) => stored[id], baseline, depthOverrides),
      ).toBe(step.id);
    }
  });

  it("shrinks the radius scale by the step factor and squares it at 0", () => {
    const sharp = cornerOverrides(() => "1rem", 0.375);
    expect(Object.keys(sharp).sort()).toEqual([...CORNER_TOKEN_IDS].sort());
    for (const value of Object.values(sharp)) expect(value).toBe("0.375rem");
    const square = cornerOverrides(() => "0.75rem", 0);
    for (const value of Object.values(square)) expect(value).toBe("0rem");
    // px baselines are understood; unparseable baselines are left alone.
    expect(cornerOverrides(() => "16px", 0.5)[CORNER_TOKEN_IDS[0]]).toBe("0.5rem");
    expect(cornerOverrides(() => "calc(1rem - 2px)", 0.5)).toEqual({});
  });

  it("round-trips corner step detection, including unparseable baselines", () => {
    const baseline = () => "1rem";
    for (const step of CORNER_STEPS.filter((s) => s.factor !== null)) {
      const written = cornerOverrides(baseline, step.factor as number);
      expect(
        detectStep(CORNER_STEPS, CORNER_TOKEN_IDS, (id) => written[id], baseline, cornerOverrides),
      ).toBe(step.id);
    }
    expect(
      detectStep(CORNER_STEPS, CORNER_TOKEN_IDS, () => undefined, baseline, cornerOverrides),
    ).toBe("default");
    // A token the compute step cannot write (calc baseline) must not block the
    // step the other tokens agree on.
    const mixed = (id: string) => (id === CORNER_TOKEN_IDS[0] ? "calc(1rem - 2px)" : "1rem");
    const written = cornerOverrides(mixed, 0.375);
    expect(written[CORNER_TOKEN_IDS[0]]).toBeUndefined();
    expect(
      detectStep(CORNER_STEPS, CORNER_TOKEN_IDS, (id) => written[id], mixed, cornerOverrides),
    ).toBe("sharp");
  });

  it("reads the blur sentinel from either theme", () => {
    expect(blurDisabledIn({ dark: {}, light: {} })).toBe(false);
    expect(blurDisabledIn({ dark: { [BLUR_TOKEN_ID]: "off" }, light: {} })).toBe(true);
    expect(blurDisabledIn({ dark: {}, light: { [BLUR_TOKEN_ID]: "off" } })).toBe(true);
    expect(blurDisabledIn({ dark: { [BLUR_TOKEN_ID]: "on" }, light: {} })).toBe(false);
  });

  it("has a stylesheet default and kill rule backing the blur sentinel", () => {
    expect(SITE_COLORS).toContain("--theme-backdrop-blur: on;");
    expect(SITE_COLORS).toContain('html[data-blur="off"]');
    expect(SITE_COLORS).toContain("backdrop-filter: none !important;");
  });

  it("keeps the harm-reduction ramp out of every flatness id list", () => {
    const rampFragments = ["danger-strong", "caution", "unsafe", "success", "info-panel"];
    for (const id of [...GLOW_TOKEN_IDS, BLUR_TOKEN_ID]) {
      for (const fragment of rampFragments) expect(id).not.toContain(fragment);
    }
  });

  it("fades every real glow baseline it will actually meet", () => {
    for (const id of GLOW_TOKEN_IDS) {
      const definitions = [
        ...SITE_COLORS.matchAll(new RegExp(`${id}:\\s*([^;]+);`, "g")),
      ].map((m) => m[1].trim());
      expect(definitions.length, `${id} should be defined`).toBeGreaterThan(0);
      for (const value of definitions) {
        expect(fadeColorsIn(value, 0.4), `${id} value should be fadeable: ${value}`).not.toBe(
          value,
        );
      }
    }
  });

  it("steps are distinct and include a full-flat extreme", () => {
    expect(DEPTH_STEPS.some((s) => s.factor === 0)).toBe(true);
    expect(GLOW_STEPS.some((s) => s.factor === 0)).toBe(true);
    expect(new Set(DEPTH_STEPS.map((s) => s.id)).size).toBe(DEPTH_STEPS.length);
    expect(new Set(GLOW_STEPS.map((s) => s.id)).size).toBe(GLOW_STEPS.length);
  });
});
