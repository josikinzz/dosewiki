import { describe, expect, it } from "vitest";
import { moleculeEditorSlug, parseMoleculeEditorSlug } from "./moleculeEditorRoute";

describe("molecule editor route", () => {
  it("reads mode and structure from the shell slug", () => {
    expect(parseMoleculeEditorSlug("classes/amphetamine")).toEqual({ mode: "classes", selected: "amphetamine" });
    expect(parseMoleculeEditorSlug("templates")).toEqual({ mode: "templates", selected: null });
    expect(parseMoleculeEditorSlug(undefined)).toEqual({ mode: "substances", selected: null });
  });

  it("keeps older substance deep links working", () => {
    expect(parseMoleculeEditorSlug("mdma")).toEqual({ mode: "substances", selected: "mdma" });
  });

  it("round-trips every selection", () => {
    for (const selection of [
      { mode: "substances", selected: "mdma" },
      { mode: "classes", selected: "amphetamine" },
      { mode: "templates", selected: null },
      { mode: "substances", selected: null },
    ] as const) {
      expect(parseMoleculeEditorSlug(moleculeEditorSlug(selection))).toEqual(selection);
    }
  });
});
