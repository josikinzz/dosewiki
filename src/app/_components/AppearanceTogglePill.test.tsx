import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppearanceTogglePill } from "./AppearanceTogglePill";

/**
 * jsdom runs no layout engine, so the invariant this file exists to protect — that the
 * thumb travels exactly one slot pitch, i.e. that the thumb and the active slot share a
 * centre — cannot be measured here: every rect comes back 0x0. These tests assert the
 * class contract that makes the geometry derivable, which is a proxy for the pixels. The
 * pixels themselves can only be confirmed in a browser, by comparing the centre of
 * `.theme-toggle-thumb` against the centre of the active slot in both states.
 *
 * It is a tight proxy, because the defect it guards against was exactly a stated size
 * disagreeing with the box that had to grant it: `h-9 w-9` plus a `translate-x-9` travel
 * over a content box that leaves 35px per slot, measured 0.5px out at rest and 1.5px out
 * at the far end. Any return to a fixed width, a fixed height or a fixed travel step on
 * the thumb fails below, whatever the numbers happen to be.
 */

/** The three spans a pill renders: the thumb, then the two icon slots in order. */
function renderPill(side: "start" | "end") {
  const { container } = render(
    <AppearanceTogglePill
      axis="color-scheme"
      value={side === "start" ? "night" : "day"}
      side={side}
      pressed={side === "end"}
      label="Switch to day mode"
      onToggle={() => {}}
      start={<span data-testid="start-glyph" />}
      end={<span data-testid="end-glyph" />}
    />,
  );

  const thumb = container.querySelector<HTMLElement>(".theme-toggle-thumb");
  const slots = Array.from(
    container.querySelectorAll<HTMLElement>("button > span:not(.theme-toggle-thumb)"),
  );

  if (!thumb) {
    throw new Error("The pill must render a thumb.");
  }

  return { thumb, slots, classes: thumb.className.split(/\s+/) };
}

describe("AppearanceTogglePill geometry", () => {
  it("anchors the thumb by insets, so its width is derived from the pill", () => {
    const { thumb } = renderPill("start");

    // left + right insets resolve against the pill's padding box, which makes the
    // thumb (W - 2b)/2 - p wide and b + p from the edge for any W, border b, padding p.
    expect(thumb).toHaveClass("absolute", "inset-y-1", "left-1", "right-1/2");
  });

  it("halves the pill's content box for each slot, rather than relying on flex-shrink", () => {
    const { slots } = renderPill("start");

    expect(slots).toHaveLength(2);
    for (const slot of slots) {
      expect(slot).toHaveClass("w-1/2");
    }
  });

  it("travels one whole thumb width, which is one slot pitch", () => {
    expect(renderPill("start").thumb).toHaveClass("translate-x-0");
    expect(renderPill("end").thumb).toHaveClass("translate-x-full");
  });

  it("states no pixel width, height or travel step on the thumb", () => {
    for (const side of ["start", "end"] as const) {
      const { classes } = renderPill(side);

      expect(classes.filter((name) => /^-?translate-x-/.test(name))).toEqual([
        side === "start" ? "translate-x-0" : "translate-x-full",
      ]);
      // A stated size, or a single vertical edge anchored past the border, is the bug.
      expect(classes.filter((name) => /^-?[wh]-/.test(name))).toEqual([]);
      expect(classes.filter((name) => /^-?(top|bottom)-/.test(name))).toEqual([]);
    }
  });

  it("animates the travel as a transform, so the slide never relayouts", () => {
    // Tailwind v4's transition-transform lists the independent `translate` property,
    // which is what translate-x-* now sets. Animating left/right instead would move
    // the same distance off the compositor.
    expect(renderPill("start").thumb).toHaveClass(
      "transition-transform",
      "motion-reduce:transition-none",
    );
  });

  it("keeps both slots structurally identical, so no glyph carries a nudge", () => {
    const { slots } = renderPill("start");
    const [startGeometry, endGeometry] = slots.map((slot) =>
      slot.className
        .split(/\s+/)
        .filter((name) => !name.startsWith("theme-toggle-icon-"))
        .sort(),
    );

    expect(startGeometry).toEqual(endGeometry);
  });
});
