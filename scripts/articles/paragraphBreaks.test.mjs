import { describe, expect, it } from "vitest";

import {
  applyAstParagraphPlan,
  applyRawParagraphInsertions,
  astCharacters,
  paragraphHash,
  restoreAstParagraphPlan,
  restoreRawParagraphInsertions,
} from "./paragraphBreaks.mjs";

describe("insertion-only article paragraph plans", () => {
  it("recovers original raw spacing and markup by removing only recorded additions", () => {
    const before = '[p]First.  Next [int-link to="/effects/old-link"]topic[/int-link].[/p]';
    const result = applyRawParagraphInsertions(before, [{
      offset: before.indexOf("Next"),
      text: "[/p]\n\n[p]",
      beforeAnchor: "First.  ",
      afterAnchor: "Next [int-link",
    }]);
    expect(result.after).toBe('[p]First.  [/p]\n\n[p]Next [int-link to="/effects/old-link"]topic[/int-link].[/p]');
    expect(restoreRawParagraphInsertions(result.after, result.receipt)).toBe(before);
    expect(() => applyRawParagraphInsertions(before.replace("First", "Other"), [{
      offset: before.indexOf("Next"), text: "[/p]\n\n[p]", beforeAnchor: "First.  ",
    }])).toThrow(/Stale/);
  });

  it("splits prose and wraps bare runs without losing repaired links, string boundaries, or metadata", () => {
    const correctedLink = { name: "int-link", properties: { to: "/effects/repaired", revision: 3 }, children: ["linked", " text"] };
    const paragraph = { name: "p", properties: { id: "original" }, editorial: { retained: true }, children: ["First ", "sentence.  Second ", correctedLink, "."] };
    const before = [
      { name: "quote", properties: { author: "Original" }, children: [paragraph, "\n\nBare ", correctedLink, " prose.\n"] },
      { name: "panel", properties: { title: "Untouched" }, children: ["Not narrative"] },
    ];
    const result = applyAstParagraphPlan(before, [
      { kind: "split", path: [0, "children", 0], breaks: ["First sentence.  ".length], expectedHash: paragraphHash(paragraph) },
      { kind: "wrap", path: [0, "children"], start: 1, count: 3, breaks: [], expectedHash: paragraphHash(before[0].children.slice(1)) },
    ]);
    expect(result.after[0].children.map((node) => node.name)).toEqual(["p", "p", "p"]);
    expect(result.after[0].children[1].children).toEqual(["Second ", correctedLink, "."]);
    expect(result.after[0].children[2].children).toEqual(["\n\nBare ", correctedLink, " prose.\n"]);
    expect(result.after[1]).toEqual(before[1]);
    expect(astCharacters(result.after)).toBe(astCharacters(before));
    expect(restoreAstParagraphPlan(result.after, result.receipt)).toEqual(before);
    const changed = structuredClone(result.after);
    changed[0].children[1].children.push("Unrecorded addition");
    expect(() => restoreAstParagraphPlan(changed, result.receipt)).toThrow(/Unrecorded/);
  });

  it("refuses stale AST targets and breaks through inline links or Unicode characters", () => {
    const paragraph = { name: "p", properties: {}, children: ["First ", { name: "int-link", properties: { to: "/effects/repaired" }, children: ["linked label"] }, "."] };
    const operation = { kind: "split", path: [0], breaks: [9], expectedHash: paragraphHash(paragraph) };
    expect(() => applyAstParagraphPlan([paragraph], [operation])).toThrow(/inline node/);
    expect(() => applyAstParagraphPlan([paragraph], [{ ...operation, expectedHash: "stale" }])).toThrow(/Stale/);
    const unicode = { name: "p", properties: {}, children: ["A \u{1D400} sentence."] };
    expect(() => applyAstParagraphPlan([unicode], [{ kind: "split", path: [0], breaks: [3], expectedHash: paragraphHash(unicode) }])).toThrow(/Unicode/);
  });
});
