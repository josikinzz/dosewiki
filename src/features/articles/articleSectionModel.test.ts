import { describe, expect, it } from "vitest";
import { buildEffectIndexArticleModel } from "./articleSectionModel";
import type { VCodeContent } from "@/features/effects/vcode/types";

function build(body_ast: VCodeContent) {
  return buildEffectIndexArticleModel({ body_raw: "", body_ast });
}

describe("buildEffectIndexArticleModel", () => {
  it("cuts a VCode body into an overview and titled sections with their own ids", () => {
    const model = build([
      { name: "p", properties: {}, children: ["Intro."] },
      { name: "hr", properties: {}, children: [] },
      { name: "h2", properties: {}, children: ["Duration"] },
      { name: "p", properties: {}, children: ["Eight hours."] },
      { name: "h3", properties: {}, children: ["Onset"] },
      { name: "hr", properties: {}, children: [] },
      { name: "h2", properties: {}, children: ["Intensity Scale"] },
      { name: "p", properties: {}, children: ["Levels."] },
    ]);

    expect(model.sections.map((section) => [section.kind, section.id])).toEqual([
      ["overview", "overview"],
      ["section", "duration"],
      ["section", "intensity-scale"],
    ]);
    // A section supplies its own rule, so the archive's `[hr]` before each
    // heading is dropped rather than doubling it.
    expect(model.sections[1].body).toEqual({
      format: "vcode",
      content: [
        { name: "p", properties: {}, children: ["Eight hours."] },
        { name: "h3", properties: {}, children: ["Onset"] },
      ],
    });
    expect(model.tocItems.map((item) => [item.id, item.label])).toEqual([
          ["overview", "Overview"],
          ["duration", "Duration"],
          ["intensity-scale", "Intensity Scale"],
        ]);
  });

  it("gives Personal Commentary the speech bubble with the quote's author, unwrapped", () => {
    const model = build([
      { name: "h2", properties: {}, children: ["Personal commentary"] },
      {
        name: "quote",
        properties: { author: "Josie Kins" },
        children: [{ name: "p", properties: {}, children: ["My view."] }],
      },
    ]);

    expect(model.sections).toEqual([
      {
        kind: "personalCommentary",
        id: "personal-commentary",
        title: "Personal commentary",
        icon: "lucide:quote",
        attribution: { name: "Josie Kins" },
        body: {
          format: "vcode",
          content: [{ name: "p", properties: {}, children: ["My view."] }],
        },
      },
    ]);
  });

  it("cuts at the level the body is actually outlined at, including markdown headings", () => {
    const model = build([
      { name: "p", properties: {}, children: ["Intro."] },
      { name: "hr", properties: {}, children: [] },
      { name: "markdown", properties: { text: "### Position\n\nSit still." }, children: [] },
      { name: "p", properties: {}, children: ["More."] },
      { name: "hr", properties: {}, children: [] },
      { name: "markdown", properties: { text: "### Guided meditation" }, children: [] },
    ]);

    expect(model.sections.map((section) => section.id)).toEqual([
      "overview",
      "position",
      "guided-meditation",
    ]);
    // The heading line leaves; the prose under it stays as a markdown node.
    expect(model.sections[1].body).toEqual({
      format: "vcode",
      content: [
        { name: "markdown", properties: { text: "Sit still." }, children: [] },
        { name: "p", properties: {}, children: ["More."] },
      ],
    });
  });

  it("rails on an intensity scale's level cards, past its lone trailing heading", () => {
    const model = build([
      {
        name: "headered-textbox",
        properties: { label: "Level 1", header: "Subtle" },
        children: [{ name: "p", properties: {}, children: ["Low."] }],
      },
      {
        name: "headered-textbox",
        properties: { label: "Level 2", header: "Mild" },
        children: [{ name: "p", properties: {}, children: ["Some."] }],
      },
      { name: "h2", properties: {}, children: ["See Also"] },
    ]);

    // One trailing heading is a section, not the outline: the cards are.
    expect(model.sections.map((section) => section.id)).toEqual(["overview", "see-also"]);
    expect(model.tocItems.map((item) => [item.id, item.label])).toEqual([
      ["level-1-subtle", "Level 1 · Subtle"],
      ["level-2-mild", "Level 2 · Mild"],
    ]);
  });

  it("keeps a body heading that slugs to a section id addressable", () => {
    const model = build([
      { name: "h2", properties: {}, children: ["Notes"] },
      { name: "h3", properties: {}, children: ["Notes"] },
      { name: "h2", properties: {}, children: ["Notes"] },
    ]);

    expect(model.sectionIds).toEqual(["notes", "notes-2"]);
  });

  it("returns no sections for an empty body", () => {
    expect(buildEffectIndexArticleModel({ body_raw: "" })).toEqual({
      sections: [],
      sectionIds: [],
      tocItems: [],
    });
  });

  it("cuts a markdown body on the same rules", () => {
    const model = buildEffectIndexArticleModel({
      bodyFormat: "markdown",
      body_raw: ["Intro.", "", "## Onset", "", "Soon.", "", "### Detail", "", "## Duration", "", "Long."].join("\n"),
    });

    expect(model.sections.map((section) => [section.kind, section.id])).toEqual([
      ["overview", "overview"],
      ["section", "onset"],
      ["section", "duration"],
    ]);
    expect(model.sections[1].body).toEqual({
      format: "markdown",
      content: "Soon.\n\n### Detail",
    });
  });
});
