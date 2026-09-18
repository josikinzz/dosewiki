import { describe, expect, it } from "vitest";

import {
  normalizeVCodeContent,
  parseRawVCodeContent,
  unwrapTopLevelQuotes,
  VCODE_TAG_NAMES,
} from "./normalize";
import { vcodeRenderers } from "./renderers";
import type { VCodeContent, VCodeNode } from "./types";

const VISUAL_DISCONNECTION_SENTENCE =
  '##b{Visual disconnection} is the experience of becoming distanced and/or detached from one\'s sense of vision. At its lower levels, this results in ##int-link|to="/effects/acuity-suppression/"{acuity suppression}, ##int-link|to="/effects/double-vision/"{double-vision}.';

function toArray(content: VCodeContent | undefined): (string | VCodeNode)[] {
  if (content === undefined) {
    return [];
  }

  return Array.isArray(content) ? content : [content];
}

function flatten(content: VCodeContent | undefined): string {
  return toArray(content)
    .map((node) => {
      if (typeof node === "string") {
        return node;
      }

      if (node.name === "markdown") {
        return node.properties.text ?? "";
      }

      return flatten(node.children);
    })
    .join("");
}

function collect(content: VCodeContent | undefined, name: string): VCodeNode[] {
  return toArray(content).flatMap((node) => {
    if (typeof node === "string") {
      return [];
    }

    return node.name === name ? [node, ...collect(node.children, name)] : collect(node.children, name);
  });
}

describe("VCODE_TAG_NAMES", () => {
  it("matches the renderer registry", () => {
    expect([...VCODE_TAG_NAMES].sort()).toEqual(Object.keys(vcodeRenderers).sort());
  });
});

describe("parseRawVCodeContent hash dialect", () => {
  const cases: Array<{
    name: string;
    raw: string;
    expectedNodes: Array<{ name: string; text?: string; properties?: Record<string, string> }>;
    expectedText: string;
  }> = [
    {
      name: "bold",
      raw: "##b{Visual disconnection} is an effect.",
      expectedNodes: [{ name: "b", text: "Visual disconnection" }],
      expectedText: "Visual disconnection is an effect.",
    },
    {
      name: "internal link",
      raw: '##int-link|to="/effects/double-vision/"{double-vision} follows.',
      expectedNodes: [
        { name: "int-link", text: "double-vision", properties: { to: "/effects/double-vision/" } },
      ],
      expectedText: "double-vision follows.",
    },
    {
      name: "nested directives",
      raw: '##b{bold with ##int-link|to="/effects/delirium"{delirium} inside}',
      expectedNodes: [
        { name: "b" },
        { name: "int-link", text: "delirium", properties: { to: "/effects/delirium" } },
      ],
      expectedText: "bold with delirium inside",
    },
    {
      name: "void directive without a body",
      raw: '##cap-img|src="/img/gallery/khole.jpg"|align="center"|top="true"Then prose.',
      expectedNodes: [
        {
          name: "captioned-image",
          properties: { src: "/img/gallery/khole.jpg", align: "center", top: "true" },
        },
      ],
      expectedText: "Then prose.",
    },
    {
      name: "markdown body moved into properties.text",
      raw: "##md{#### Structures}Structures are the only feature.",
      expectedNodes: [{ name: "markdown", properties: { text: "#### Structures" } }],
      expectedText: "#### StructuresStructures are the only feature.",
    },
    {
      name: "aliased quotation",
      raw: '##quotation|author="Josie Kins"{A closing thought.}',
      expectedNodes: [{ name: "quote", text: "A closing thought.", properties: { author: "Josie Kins" } }],
      expectedText: "A closing thought.",
    },
    {
      name: "unknown directive degrades to its inner text",
      raw: "Before ##mystery-directive|a=\"1\"{inner text} after.",
      expectedNodes: [],
      expectedText: "Before inner text after.",
    },
    {
      name: "malformed unclosed directive degrades to its inner text",
      raw: "Before ##b{unclosed bold text",
      expectedNodes: [],
      expectedText: "Before unclosed bold text",
    },
    {
      name: "markdown heading hashes are left alone",
      raw: "#### Multisensory aspects are common.",
      expectedNodes: [],
      expectedText: "#### Multisensory aspects are common.",
    },
  ];

  it.each(cases)("handles $name", ({ raw, expectedNodes, expectedText }) => {
    const content = parseRawVCodeContent(raw);

    expect(flatten(content)).toBe(expectedText);
    expect(flatten(content)).not.toMatch(/##[A-Za-z]/);

    for (const expected of expectedNodes) {
      const [node] = collect(content, expected.name);
      expect(node, `expected a ${expected.name} node`).toBeDefined();

      if (expected.text !== undefined) {
        expect(flatten(node.children)).toBe(expected.text);
      }

      if (expected.properties) {
        expect(node.properties).toMatchObject(expected.properties);
      }
    }
  });

  it("converts the visual-disconnection sentence", () => {
    const content = parseRawVCodeContent(VISUAL_DISCONNECTION_SENTENCE);

    expect(flatten(content)).toBe(
      "Visual disconnection is the experience of becoming distanced and/or detached from one's sense of vision. At its lower levels, this results in acuity suppression, double-vision.",
    );
    expect(collect(content, "b")).toHaveLength(1);
    expect(collect(content, "int-link").map((node) => node.properties.to)).toEqual([
      "/effects/acuity-suppression/",
      "/effects/double-vision/",
    ]);
  });

  it("groups blank-line separated prose into paragraphs around block directives", () => {
    const content = parseRawVCodeContent(
      '##b{Lead} paragraph.\n\n##cap-img|src="/img/gallery/a.jpg"\nTrailing paragraph.',
    );

    expect(toArray(content).map((node) => (typeof node === "string" ? "text" : node.name))).toEqual([
      "p",
      "captioned-image",
      "p",
    ]);
  });

  it("leaves prose brackets alone instead of opening a node", () => {
    const content = parseRawVCodeContent(
      "See [Monism](https://example.com) and [Alan Watts] for context.",
    );

    expect(content).toBe("See [Monism](https://example.com) and [Alan Watts] for context.");
  });

  it("still parses the bracket dialect and mixed content", () => {
    const content = parseRawVCodeContent(
      '[p][b]Bracket bold[/b] and ##int-link|to="/effects/delirium/"{delirium}.[/p]',
    );

    expect(flatten(content)).toBe("Bracket bold and delirium.");
    expect(collect(content, "int-link")).toHaveLength(1);
  });
});

describe("normalizeVCodeContent", () => {
  it("repairs hash directives stored inside an AST array", () => {
    const content = normalizeVCodeContent([VISUAL_DISCONNECTION_SENTENCE], undefined);

    expect(flatten(content)).not.toMatch(/##[A-Za-z]/);
    expect(collect(content, "int-link")).toHaveLength(2);
  });

  it("repairs hash directives stored inside AST node children", () => {
    const content = normalizeVCodeContent(
      { name: "p", properties: {}, children: ["##b{Bold} tail."] },
      undefined,
    );

    expect(flatten(content)).toBe("Bold tail.");
    expect(collect(content, "b")).toHaveLength(1);
  });

  it("is idempotent for already normalized content", () => {
    const once = normalizeVCodeContent([VISUAL_DISCONNECTION_SENTENCE], undefined);
    const twice = normalizeVCodeContent(once, undefined);

    expect(twice).toEqual(once);
  });

  it("leaves clean content untouched", () => {
    const ast = [
      "\n\n",
      { name: "p", properties: {}, children: ["Plain prose with #4 and #### hashes."] },
    ];

    expect(normalizeVCodeContent(ast, undefined)).toEqual(ast);
  });
});

describe("unwrapTopLevelQuotes", () => {
  it("unwraps a top-level quote and regroups loose prose into paragraphs", () => {
    const content = unwrapTopLevelQuotes([
      {
        name: "quote",
        properties: { author: "Josie Kins" },
        children: ["First paragraph.\n\nSecond paragraph."],
      },
    ]);

    expect(collect(content, "quote")).toHaveLength(0);
    const paragraphs = collect(content, "p");
    expect(paragraphs).toHaveLength(2);
    expect(flatten(paragraphs[0])).toBe("First paragraph.");
    expect(flatten(paragraphs[1])).toBe("Second paragraph.");
  });

  it("preserves existing block children and surrounding content", () => {
    const paragraph: VCodeNode = { name: "p", properties: {}, children: ["Kept paragraph."] };
    const content = unwrapTopLevelQuotes([
      "Lead-in text.",
      { name: "quote", properties: {}, children: [paragraph] },
    ]);

    expect(content).toEqual(["Lead-in text.", paragraph]);
  });

  it("leaves nested quotes and plain content untouched", () => {
    const nested: VCodeNode = {
      name: "p",
      properties: {},
      children: [{ name: "quote", properties: {}, children: ["Inner quote."] }],
    };

    expect(unwrapTopLevelQuotes([nested])).toEqual([nested]);
    expect(unwrapTopLevelQuotes("Raw string content")).toBe("Raw string content");
  });
});
