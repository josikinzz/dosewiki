import { describe, expect, it } from "vitest";

import {
  getEffectIndexArticleTocItems,
  getMarkdownArticleTocItems,
} from "./articleTocModel";

describe("getEffectIndexArticleTocItems", () => {
  it("lists the body's own section headings and skips their subheadings", () => {
    const items = getEffectIndexArticleTocItems([
      { name: "h2", properties: {}, children: ["Duration"] },
      { name: "p", properties: {}, children: ["Body copy."] },
      { name: "h2", properties: {}, children: ["Intensity Scale"] },
      { name: "h3", properties: {}, children: ["Sensory"] },
    ]);

    expect(items.map((item) => [item.id, item.label])).toEqual([
      ["duration", "Duration"],
      ["intensity-scale", "Intensity Scale"],
    ]);
  });

  it("reads headings through markup that wraps them", () => {
    const items = getEffectIndexArticleTocItems([
      {
        name: "h2",
        properties: {},
        children: [{ name: "int-link", properties: { to: "/dmt" }, children: ["DMT"] }, " onset"],
      },
      { name: "markdown", properties: { text: "## Comedown\n\nAfterwards." }, children: [] },
    ]);

    expect(items.map((item) => [item.id, item.label])).toEqual([
      ["dmt-onset", "DMT onset"],
      ["comedown", "Comedown"],
    ]);
  });

  it("keeps repeated headings addressable with distinct ids", () => {
    const items = getEffectIndexArticleTocItems([
      { name: "h2", properties: {}, children: ["Notes"] },
      { name: "h2", properties: {}, children: ["Notes"] },
    ]);

    expect(items.map((item) => item.id)).toEqual(["notes", "notes-2"]);
  });

  it("rails on h3 when the body has no h2 at all", () => {
    const items = getEffectIndexArticleTocItems([
      { name: "h3", properties: {}, children: ["Position"] },
      { name: "h3", properties: {}, children: ["Guided meditation"] },
      { name: "h3", properties: {}, children: ["References"] },
    ]);

    expect(items.map((item) => item.label)).toEqual([
      "Position",
      "Guided meditation",
      "References",
    ]);
  });

  it("rails on the level cards of an intensity scale, past its lone trailing heading", () => {
    const items = getEffectIndexArticleTocItems([
      {
        name: "headered-textbox",
        properties: { label: "Level 1", header: "Subtle" },
        children: [{ name: "panel", properties: { title: "Cognitive" }, children: [] }],
      },
      {
        name: "headered-textbox",
        properties: { label: "Level 2", header: "Mild" },
        children: [{ name: "panel", properties: { title: "Cognitive" }, children: [] }],
      },
      { name: "h2", properties: {}, children: ["See Also"] },
    ]);

    expect(items.map((item) => [item.id, item.label])).toEqual([
      ["level-1-subtle", "Level 1 · Subtle"],
      ["level-2-mild", "Level 2 · Mild"],
    ]);
  });

  it("falls through to panel titles when they are the only structure", () => {
    const items = getEffectIndexArticleTocItems([
      { name: "panel", properties: { title: "Onset" }, children: [] },
      { name: "panel", properties: { title: "Offset" }, children: [] },
    ]);

    expect(items.map((item) => item.id)).toEqual(["onset", "offset"]);
  });

  it("returns nothing for a body with a single heading", () => {
    expect(
      getEffectIndexArticleTocItems([
        { name: "h2", properties: {}, children: ["See Also"] },
        { name: "p", properties: {}, children: ["Body copy."] },
      ]),
    ).toEqual([]);
  });

  it("parses a raw body so articles stored without an AST still get a rail", () => {
    const items = getEffectIndexArticleTocItems(
      "[h2]Onset[/h2][p]Body copy.[/p][h2]Offset[/h2]",
    );

    expect(items.map((item) => item.id)).toEqual(["onset", "offset"]);
  });

  it("returns nothing for an unstructured or missing body", () => {
    expect(getEffectIndexArticleTocItems("Just one long unstructured essay.")).toEqual([]);
    expect(getEffectIndexArticleTocItems(undefined)).toEqual([]);
  });
});

describe("getMarkdownArticleTocItems", () => {
  it("outlines a markdown body at its shallowest repeated heading level", () => {
    const items = getMarkdownArticleTocItems(
      ["# Title", "", "## Onset", "", "### Detail", "", "## Duration"].join("\n"),
    );

    expect(items.map((item) => [item.id, item.label])).toEqual([
      ["onset", "Onset"],
      ["duration", "Duration"],
    ]);
  });

  it("strips inline markdown so an anchor matches the rendered heading text", () => {
    const items = getMarkdownArticleTocItems(
      ["## The **Big** Idea", "", "## A [linked](/x) heading"].join("\n"),
    );

    expect(items.map((item) => [item.id, item.label])).toEqual([
      ["the-big-idea", "The Big Idea"],
      ["a-linked-heading", "A linked heading"],
    ]);
  });

  it("suffixes a repeated title exactly as the VCode path does", () => {
    const markdown = getMarkdownArticleTocItems(["## Notes", "", "## Notes"].join("\n"));
    const vcode = getEffectIndexArticleTocItems([
      { name: "h2", properties: {}, children: ["Notes"] },
      { name: "h2", properties: {}, children: ["Notes"] },
    ]);

    expect(markdown.map((item) => item.id)).toEqual(["notes", "notes-2"]);
    expect(markdown.map((item) => item.id)).toEqual(vcode.map((item) => item.id));
  });

  it("ignores hashes inside fenced code", () => {
    const items = getMarkdownArticleTocItems(
      ["## Real", "", "```", "# not a heading", "```", "", "## Also real"].join("\n"),
    );

    expect(items.map((item) => item.id)).toEqual(["real", "also-real"]);
  });

  it("returns nothing for a body with no outline", () => {
    expect(getMarkdownArticleTocItems("Just prose.\n\n## One heading")).toEqual([]);
  });
});
