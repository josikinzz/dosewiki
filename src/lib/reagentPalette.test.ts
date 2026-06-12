import { describe, expect, it } from "vitest";

import {
  REAGENT_RESULT_FALLBACK_COLOR,
  REAGENT_RESULT_NEUTRAL_COLOR,
  REAGENT_RESULT_PALETTE,
  buildReagentResultGradient,
  buildReagentResultLabelGradient,
  parseReagentResultColors,
} from "./reagentPalette";

describe("reagent palette", () => {
  it("parses reagent descriptions into ordered palette colors", () => {
    expect(parseReagentResultColors("purple to black")).toEqual([
      REAGENT_RESULT_PALETTE.purple,
      REAGENT_RESULT_PALETTE.black,
    ]);
    expect(parseReagentResultColors("yellow/orange")).toEqual([
      REAGENT_RESULT_PALETTE.yellow,
      REAGENT_RESULT_PALETTE.orange,
    ]);
    expect(parseReagentResultColors("dark blue")).toEqual([
      REAGENT_RESULT_PALETTE["dark blue"],
    ]);
  });

  it("uses explicit neutral and fallback colors for non-color descriptions", () => {
    expect(parseReagentResultColors("no reaction")).toEqual([
      REAGENT_RESULT_NEUTRAL_COLOR,
    ]);
    expect(parseReagentResultColors("none")).toEqual([
      REAGENT_RESULT_NEUTRAL_COLOR,
    ]);
    expect(parseReagentResultColors("unexpected fizzing")).toEqual([
      REAGENT_RESULT_FALLBACK_COLOR,
    ]);
  });

  it("builds display and label gradients from parsed palette colors", () => {
    const colors = parseReagentResultColors("purple to black");

    expect(buildReagentResultGradient(colors)).toBe(
      `linear-gradient(to right, ${REAGENT_RESULT_PALETTE.purple}, ${REAGENT_RESULT_PALETTE.black})`,
    );
    expect(buildReagentResultLabelGradient(colors)).toBe(
      "linear-gradient(to right, rgb(46,22,49), rgb(7,7,7))",
    );
  });
});
