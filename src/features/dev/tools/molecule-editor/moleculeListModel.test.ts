import { describe, expect, it } from "vitest";
import {
  countMoleculeFilters,
  depictionLabel,
  depictionStateOf,
  matchesMoleculeSearch,
  visibleMoleculeGroups,
  type MoleculeListRow,
} from "./moleculeListModel";

const row = (slug: string, title: string, depiction: MoleculeListRow["depiction"]): MoleculeListRow => ({
  slug,
  title,
  hasOverride: depiction !== "none",
  depiction,
});

describe("moleculeListModel", () => {
  it("reads the stored row's source, falling back to the picker's flag", () => {
    expect(depictionStateOf({ source: "seeded" }, true)).toBe("seeded");
    expect(depictionStateOf({ source: "editor" }, true)).toBe("editor");
    expect(depictionStateOf({ source: "template" }, true)).toBe("template");
    expect(depictionStateOf(undefined, true)).toBe("saved");
    expect(depictionStateOf(undefined, false)).toBe("none");
  });

  it("counts a missing drawing and the automatic baseline as still to do", () => {
    const rows = [row("a", "A", "none"), row("b", "B", "seeded"), row("c", "C", "editor"), row("d", "D", "template")];
    expect(countMoleculeFilters(rows)).toEqual({ all: 4, todo: 2, edited: 2 });
    const todo = visibleMoleculeGroups(rows, "todo", "").flatMap((group) => group.items.map((item) => item.slug));
    expect(todo).toEqual(["a", "b"]);
  });

  it("matches the name or the key, ignoring punctuation", () => {
    expect(matchesMoleculeSearch(row("1-4-butanediol", "1,4-Butanediol", "none"), "14but")).toBe(true);
    expect(matchesMoleculeSearch(row("lsd", "LSD", "none"), "ls")).toBe(true);
    expect(matchesMoleculeSearch(row("lsd", "LSD", "none"), "mdma")).toBe(false);
  });

  it("names a template by whether it is saved", () => {
    expect(depictionLabel("none", "templates")).toBe("No template yet");
    expect(depictionLabel("saved", "templates")).toBe("Saved template");
    expect(depictionLabel("seeded", "substances")).toBe("Automatic layout");
  });
});
