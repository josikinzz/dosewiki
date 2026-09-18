import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PanelButton, PanelChip, PanelIconButton, PanelRow } from "./panelKit";

/**
 * The Theme Lab's controls are the shared UI Kit's, not its own.
 *
 * The kit's catalog completeness gate keeps shared primitives *documented*; it
 * cannot see whether a feature actually uses them, which is how this panel
 * accumulated ~1,600 lines of hand-tuned buttons, inputs, textareas, badges and
 * tabs, and with them its undersized touch targets and illegible micro-text.
 * The policy scan below is the missing half of that gate, scoped to this panel.
 */

const FEATURE_DIR = resolve(process.cwd(), "src/features/theme-lab");

/**
 * Files allowed to render a raw form element, and why:
 *
 * - `ColorField`'s alpha track is a `type="range"` instrument painted with a
 *   live gradient; the kit's `Input` is a text field and has no analogue.
 * - `LengthField` is the same instrument for the radius scale: a `type="range"`
 *   track with a live fill. It shares the alpha track's styling rather than
 *   growing a second one, and the kit still ships no slider.
 * - `AngleField` is that instrument again for the hue seeds, wearing a full
 *   turn of hue. Its every *other* control (the wrap-around nudges, the typed
 *   readout) is a kit component; only the track is raw.
 */
const RAW_ELEMENT_ALLOWLIST = ["ColorField.tsx", "LengthField.tsx", "AngleField.tsx"];

function panelSources() {
  return readdirSync(FEATURE_DIR)
    .filter((name) => name.endsWith(".tsx") && !/\.test(?:Harness)?\./.test(name))
    .filter((name) => !RAW_ELEMENT_ALLOWLIST.includes(name))
    .map((name) => ({ name, source: readFileSync(resolve(FEATURE_DIR, name), "utf8") }));
}

describe("Theme Lab panel controls", () => {
  it("policy: theme-lab panels render no raw <button>, <input>, or <textarea> outside the allowlisted range instruments", () => {
    for (const { name, source } of panelSources()) {
      expect(source, `src/features/theme-lab/${name} hand-rolls a button`).not.toMatch(/<button[\s>]/);
      expect(source, `src/features/theme-lab/${name} hand-rolls a field`).not.toMatch(/<(input|textarea)[\s>]/);
    }
  });

  /**
   * The kit's Button base sets `[&_svg]:size-4`, a descendant declaration that
   * outranks the width/height attributes `Icon` writes, so a wrapper that says
   * nothing hands every glyph inside it a silent 16px. The kit compensates the
   * same way in its own `quiet` size. Any control here that can hold an icon
   * must restate the size its call sites author.
   */
  it.each([
    ["PanelChip", <PanelChip active={false} onClick={() => {}}>x</PanelChip>],
    ["PanelIconButton", <PanelIconButton aria-label="x" onClick={() => {}}>x</PanelIconButton>],
    ["PanelRow", <PanelRow active={false} onClick={() => {}}>x</PanelRow>],
    ["PanelButton", <PanelButton>x</PanelButton>],
  ])("%s restates an explicit svg size so the kit's [&_svg]:size-4 cannot win", (_name, element) => {
    const { container } = render(element);
    expect(container.querySelector("button")?.className).toMatch(/\[&_svg\]:size-\[\d+px\]/);
  });
});
