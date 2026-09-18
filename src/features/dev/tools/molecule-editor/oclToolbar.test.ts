import { describe, expect, it } from "vitest";
import {
  OCL_TOOLS,
  OCL_UNDO_BUTTON,
  oclToolbarButtonAt,
  oclToolbarButtonCentre,
  oclToolForButton,
  oclToolForShortcutKey,
} from "./oclToolbar";

// A toolbar of 21px buttons behind a 2px border at 1x: 2*2 + 2*21 wide, 2*2 + 17*21 tall.
const WIDTH = 46;
const HEIGHT = 361;

describe("oclToolbar geometry", () => {
  it("round-trips every strip tool and undo through centre and hit test", () => {
    for (const button of [...OCL_TOOLS.map((tool) => tool.button), OCL_UNDO_BUTTON]) {
      const centre = oclToolbarButtonCentre(WIDTH, HEIGHT, button);
      expect(oclToolbarButtonAt(WIDTH, HEIGHT, centre.x, centre.y)).toBe(button);
    }
  });

  it("places the second column beside the first", () => {
    // Bond (5) and down-bond / hash (23) differ by one column and one row.
    const bond = oclToolbarButtonCentre(WIDTH, HEIGHT, 5);
    const hash = oclToolbarButtonCentre(WIDTH, HEIGHT, 23);
    expect(hash.x - bond.x).toBe(21);
    expect(hash.y - bond.y).toBe(21);
  });

  it("scales with the canvas rather than assuming 1x", () => {
    // The same toolbar at 1.5x UI scale.
    const centre = oclToolbarButtonCentre(WIDTH * 1.5, HEIGHT * 1.5, 2);
    expect(centre).toEqual({ x: 3 + 31.5 * 0.5, y: 3 + 31.5 * 2.5 });
  });

  it("reports -1 outside the button grid", () => {
    expect(oclToolbarButtonAt(WIDTH, HEIGHT, 0, 0)).toBe(-1);
    expect(oclToolbarButtonAt(WIDTH, HEIGHT, WIDTH, 10)).toBe(-1);
    expect(oclToolbarButtonAt(WIDTH, HEIGHT, 10, HEIGHT)).toBe(-1);
    expect(oclToolbarButtonAt(0, 0, 0, 0)).toBe(-1);
  });
});

describe("oclToolbar tool lookups", () => {
  it("maps strip buttons to tools and everything else to null", () => {
    expect(oclToolForButton(2)).toBe("select");
    expect(oclToolForButton(23)).toBe("hash");
    expect(oclToolForButton(7)).toBeNull();
    expect(oclToolForButton(OCL_UNDO_BUTTON)).toBeNull();
  });

  it("trusts only non-letter shortcuts", () => {
    expect(oclToolForShortcutKey(" ")).toBe("select");
    expect(oclToolForShortcutKey("1")).toBe("bond");
    expect(oclToolForShortcutKey(".")).toBe("atom");
    expect(oclToolForShortcutKey("0")).toBe("erase");
    // Ring tools leave the strip; letters may have labeled an atom instead.
    expect(oclToolForShortcutKey("6")).toBeNull();
    expect(oclToolForShortcutKey("u")).toBeNull();
    expect(oclToolForShortcutKey("c")).toBeNull();
    // Flip, Enter, Escape and plain typing change no tool.
    expect(oclToolForShortcutKey("h")).toBeUndefined();
    expect(oclToolForShortcutKey("Enter")).toBeUndefined();
    expect(oclToolForShortcutKey("Escape")).toBeUndefined();
  });
});
