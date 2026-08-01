// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Theme Lab's controls are the shared UI Kit's, not its own.
 *
 * The kit's catalog completeness gate keeps shared primitives *documented*; it
 * cannot see whether a feature actually uses them, which is how this panel
 * accumulated ~1,600 lines of hand-tuned buttons, inputs, textareas, badges and
 * tabs — and with them its undersized touch targets and illegible micro-text.
 *
 * This is the missing half of that gate, scoped to this panel: the private
 * stylesheet may describe the panel's layout and its two bespoke instruments,
 * and nothing else. It is a build-artifact test in the same spirit as the
 * pre-paint bootstrap's byte-stability test — it reads the checked-in source.
 */

const FEATURE_DIR = resolve(process.cwd(), "src/features/theme-lab");

const stylesheet = readFileSync(resolve(FEATURE_DIR, "PaletteLab.module.css"), "utf8");

/**
 * Class names that existed only to re-style a control the kit already ships.
 * Each one is now a `Button`, `Input`, `Textarea` or `Badge` from the shared
 * barrels. A new one appearing here means the drift has started again.
 */
const RETIRED_CONTROL_CLASSES = [
  "closeButton",
  "iconButton",
  "pickToggleActive",
  "themeChip",
  "themeChipActive",
  "changedBadgeButton",
  "viewTab",
  "viewTabPrimary",
  "viewTabSecondary",
  "viewTabActive",
  "searchInput",
  "hexInput",
  "rawTextarea",
  "resetTokenButton",
  "tokenRow",
  "tokenRowActive",
  "tokenRowInert",
  "rawTag",
  "sharedBadge",
  "scopeBadge",
  "mergedMember",
  "advancedToggle",
  "advancedToggleOpen",
  "copyButton",
  "applyButton",
  "jsonTextarea",
  "dangerButton",
  "pickMenuItem",
  "presetCard",
  "presetCardActive",
  "presetActiveBadge",
];

/**
 * Files allowed to render a raw form element, and why:
 *
 * - `PaletteLabTrigger` is site chrome, not a panel control: it sits beside the
 *   footer/homepage theme toggle and wears the same shared `theme-icon-button`
 *   recipe those neighbours do.
 * - `ColorField`'s alpha track is a `type="range"` instrument painted with a
 *   live gradient; the kit's `Input` is a text field and has no analogue.
 * - `LengthField` is the same instrument for the radius scale: a `type="range"`
 *   track with a live fill. It shares the alpha track's styling rather than
 *   growing a second one, and the kit still ships no slider.
 * - `AngleField` is that instrument again for the hue seeds, wearing a full
 *   turn of hue. Its every *other* control (the wrap-around nudges, the typed
 *   readout) is a kit component; only the track is raw.
 */
const RAW_ELEMENT_ALLOWLIST = new Set([
  "PaletteLabTrigger.tsx",
  "ColorField.tsx",
  "LengthField.tsx",
  "AngleField.tsx",
]);

function panelSources() {
  return readdirSync(FEATURE_DIR)
    .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
    .filter((name) => !RAW_ELEMENT_ALLOWLIST.has(name))
    .map((name) => ({ name, source: readFileSync(resolve(FEATURE_DIR, name), "utf8") }));
}

describe("Theme Lab panel controls", () => {
  it("no longer declares control styling in its private stylesheet", () => {
    for (const className of RETIRED_CONTROL_CLASSES) {
      expect(stylesheet, `.${className} is the kit's job now`).not.toMatch(
        new RegExp(`\\.${className}[\\s,{:]`),
      );
    }
  });

  it("renders every button, field and badge from the shared kit", () => {
    for (const { name, source } of panelSources()) {
      expect(source, `${name} hand-rolls a button`).not.toMatch(/<button[\s>]/);
      expect(source, `${name} hand-rolls a field`).not.toMatch(/<(input|textarea)[\s>]/);
    }
  });

  /**
   * The kit's Button base sets `[&_svg]:size-4` — a descendant declaration that
   * outranks the width/height attributes `Icon` writes — so a wrapper that says
   * nothing hands every glyph inside it a silent 16px. The kit compensates the
   * same way in its own `quiet` size. Any control here that can hold an icon
   * must restate the size its call sites author.
   */
  it("restates its icon sizes on every control that can hold one", () => {
    const source = readFileSync(resolve(FEATURE_DIR, "panelKit.tsx"), "utf8");
    const bodies = new Map<string, string>();
    const parts = source.split(/export function (\w+)/);
    for (let i = 1; i < parts.length; i += 2) bodies.set(parts[i], parts[i + 1]);

    for (const control of ["PanelChip", "PanelIconButton", "PanelRow", "PanelButton"]) {
      expect(bodies.get(control), `${control} is missing from panelKit`).toBeDefined();
      expect(bodies.get(control), `${control} lets the kit force its icons to 16px`).toContain(
        "PANEL_ICON[",
      );
    }
  });

  it("keeps the panel's own stylesheet to layout and its bespoke instruments", () => {
    // A ratchet, not a target: the file was 1,747 lines before the controls
    // moved onto the kit. What is left is panel/sheet layout, the color field
    // and alpha track, the swatch checkerboard, the eyedropper overlays, and
    // the docked share-invite card — the one surface the lab paints outside its
    // own panel, whose contents still borrow the drawer, action-row and error
    // classes rather than growing their own.
    expect(stylesheet.split("\n").length).toBeLessThanOrEqual(1320);
  });
});
