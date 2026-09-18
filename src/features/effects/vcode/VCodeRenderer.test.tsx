import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VCodeRenderer } from "./VCodeRenderer";
import { extractVCodeHeadings } from "./headings";

vi.mock("@/components/common/AppImage", () => ({
  AppImage: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} />
  ),
}));

describe("VCodeRenderer", () => {
  it("renders representative registry-backed nodes", () => {
    render(
      <VCodeRenderer
        citations={[{ url: "https://example.com/citation", text: "Citation 1" }]}
        subarticles={[{ id: "after-effects", title: "After effects" }]}
        content={[
          {
            name: "h2",
            properties: {},
            children: ["Overview"],
          },
          {
            name: "quote",
            properties: { author: "Albert Hofmann", source: "Lab Notes" },
            children: ["A representative quotation."],
          },
          {
            name: "toc",
            properties: {},
            children: [],
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("A representative quotation.")).toBeInTheDocument();
    expect(screen.getByText("After effects")).toBeInTheDocument();
  });

  it("keeps fallback behavior for unknown tags with children", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <VCodeRenderer
        content={[
          {
            name: "mystery-tag",
            properties: {},
            children: ["Unknown tag content"],
          },
        ]}
      />,
    );

    expect(screen.getByText("Unknown tag content")).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledWith("Unknown VCode tag: mystery-tag");

    warnSpy.mockRestore();
  });

  it("parses raw EffectIndex VCode strings before rendering", () => {
    const { container } = render(
      <VCodeRenderer
        citations={[{ url: "https://example.com/ref", text: "Reference" }]}
        content={'[p][b]Colour enhancement[/b] links to [int-link to="/effects/visual-acuity-enhancement"]visual acuity[/int-link].[ref to="1" no="1"][/p]'}
      />,
    );

    expect(screen.getByText("Colour enhancement")).toHaveClass("font-semibold");
    expect(screen.getByRole("link", { name: "visual acuity" })).toHaveAttribute(
      "href",
      "/effects/visual-acuity-enhancement",
    );
    expect(screen.getByRole("link", { name: "Citation 1" })).toHaveAttribute("href", "#cite-1");
    expect(container.textContent).not.toContain("[p]");
    expect(container.textContent).not.toContain("[ref");
  });

  it("repairs external links authored with a leading slash", () => {
    render(
      <VCodeRenderer
        content={
          '[p][ext-link to="/https://en.wikipedia.org/wiki/Turing_test"]Turing test[/ext-link][/p]'
        }
      />,
    );

    expect(screen.getByRole("link", { name: /Turing test/ })).toHaveAttribute(
      "href",
      "https://en.wikipedia.org/wiki/Turing_test",
    );
  });

  it("renders hash-dialect EffectIndex markup instead of literal directives", () => {
    const { container } = render(
      <VCodeRenderer
        content={
          '##b{Visual disconnection} is the experience of becoming distanced and/or detached from one\'s sense of vision. At its lower levels, this results in ##int-link|to="/effects/acuity-suppression/"{acuity suppression}, ##int-link|to="/effects/double-vision/"{double-vision}, ...'
        }
      />,
    );

    expect(screen.getByText("Visual disconnection")).toHaveClass("font-semibold");
    expect(screen.getByRole("link", { name: "acuity suppression" })).toHaveAttribute(
      "href",
      "/effects/acuity-suppression",
    );
    expect(screen.getByRole("link", { name: "double-vision" })).toHaveAttribute(
      "href",
      "/effects/double-vision",
    );
    expect(container.textContent).not.toMatch(/##[a-z]/i);
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });

  it("renders hash-dialect AST leaves, unknown directives, and unclosed directives", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { container } = render(
      <VCodeRenderer
        content={[
          '##md{#### Structures}Structures float above the person.\n\n##mystery-directive|a="1"{Salvaged inner text} and ##b{an unclosed run',
        ]}
      />,
    );

    expect(screen.getByRole("heading", { level: 4, name: "Structures" })).toBeInTheDocument();
    expect(screen.getByText("Structures float above the person.")).toBeInTheDocument();
    expect(
      screen.getByText("Salvaged inner text and an unclosed run"),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/##[a-z]/i);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("renders multi-line markdown bodies as blocks and lists", () => {
    const { container } = render(
      <VCodeRenderer
        content={"##md{- Blurred vision\n- Double vision}Trailing prose."}
      />,
    );

    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByText("Blurred vision").tagName.toLowerCase()).toBe("li");
    expect(screen.getByText("Trailing prose.")).toBeInTheDocument();
  });

  it("renders article-only superscript, YouTube, and legacy audio constructs", () => {
    render(
      <VCodeRenderer
        content={[
          {
            name: "sup",
            properties: {},
            children: ["(common)"],
          },
          {
            name: "youtube-embed",
            properties: {
              src: "Q4QLxpLdSrA",
              title: "Fundraising Campaign",
            },
            children: [],
          },
          {
            name: "audio-player",
            properties: {
              src: "/audio/guided-meditation.ogg",
              title: "Guided meditation",
            },
            children: [],
          },
        ]}
      />,
    );

    expect(screen.getByText("(common)").tagName).toBe("SUP");
    expect(screen.getByTitle("Fundraising Campaign")).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/Q4QLxpLdSrA",
    );
    expect(document.querySelector("audio")).toHaveAttribute(
      "src",
      "/audio/guided-meditation.ogg",
    );
  });

  it("renders block VCode children outside paragraph elements", () => {
    const { container } = render(
      <VCodeRenderer
        content={[
          {
            name: "p",
            properties: {},
            children: [
              "Before the replication.",
              {
                name: "captioned-image",
                properties: {
                  src: "/img/gallery/example.jpg",
                  caption: "Example replication",
                },
                children: [],
              },
              "After the replication.",
            ],
          },
        ]}
      />,
    );

    const figure = container.querySelector("figure");
    expect(figure).not.toBeNull();
    expect(figure?.closest("p")).toBeNull();
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(screen.getByText("Before the replication.").tagName.toLowerCase()).toBe("p");
    expect(screen.getByText("After the replication.").tagName.toLowerCase()).toBe("p");
  });

  it("anchors headings on the ids the table of contents derives", () => {
    const content = [
      { name: "h2", properties: {}, children: ["Duration"] },
      { name: "markdown", properties: { text: "### Notes\n\nBody copy." }, children: [] },
      {
        name: "headered-textbox",
        properties: { label: "Level 1", header: "Subtle" },
        children: [{ name: "panel", properties: { title: "Cognitive" }, children: [] }],
      },
      { name: "h2", properties: {}, children: ["Notes"] },
    ];

    const { container } = render(<VCodeRenderer content={content} headingIds />);

    expect(Array.from(container.querySelectorAll("[id]")).map((element) => element.id)).toEqual(
      extractVCodeHeadings(content).map((heading) => heading.id),
    );
    expect(container.querySelector("#duration")).toHaveClass("scroll-mt-24");
    expect(container.querySelector("#level-1-subtle")).toHaveClass("scroll-mt-24");
    expect(container.querySelector("#cognitive")).toHaveClass("scroll-mt-24");
  });

  const COLUMNS_RAW = `[columns]
[column]
[panel title="Cognitive" icon="user.svg"]
[ul]
[li][b][int-link to="/effects/anxiety-suppression"]Anxiety suppression[/int-link][/b] [sup](common)[/sup][/li]
[li][b][int-link to="/effects/nausea"]Nausea[/int-link][/b][/li]
[ul][li][b][int-link to="/effects/nausea?s=vomiting"]Vomiting[/int-link][/b][/li][/ul]
[/ul]
[/panel]
[/column]
[column]
[/column]
[column]
[/column]
[/columns]`;

  it("renders an effect roundup as an index panel and drops the padding columns", () => {
    const { container } = render(<VCodeRenderer content={COLUMNS_RAW} />);

    // Effect Index pads every group to three columns; only the filled one lays out.
    expect(container.querySelectorAll("section")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Cognitive" })).toBeInTheDocument();

    // Sub-effects included, matching what the panel lists.
    expect(screen.getByLabelText("3 items")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Anxiety suppression/ })).toHaveAttribute(
      "href",
      "/effects/anxiety-suppression",
    );
    expect(screen.getByText("(common)")).toBeInTheDocument();
    // The subarticle selector resolves to the anchor the section renders with.
    expect(screen.getByRole("link", { name: /Vomiting/ })).toHaveAttribute(
      "href",
      "/effects/nausea#vomiting",
    );
  });

  it("keeps a sectioned panel's anchor ids in the order the table of contents walks", () => {
    const content = `[panel title="Visual" icon="eye.svg"]
[h3][int-link to="/articles/approximate-frequency-of-occurrence-scale"]near universal[/int-link][/h3]
[ul][li][b][int-link to="/effects/colour-enhancement"]Colour enhancement[/int-link][/b][/li][/ul]
[h3][int-link to="/articles/approximate-frequency-of-occurrence-scale"]frequent[/int-link][/h3]
[ul][li][b][int-link to="/effects/drifting"]Drifting[/int-link][/b][/li][/ul]
[/panel]`;

    const { container } = render(<VCodeRenderer content={content} headingIds />);

    // Anchor targets only — the card's own collapsible region carries a
    // generated id that is plumbing, not a destination.
    expect(
      Array.from(container.querySelectorAll("[id].scroll-mt-24")).map((element) => element.id),
    ).toEqual(extractVCodeHeadings(content).map((heading) => heading.id));
  });

  it("falls back to generic rendering for a panel carrying prose", () => {
    const content = `[panel title="Visual"][p]These build on one another.[/p][/panel]`;

    render(<VCodeRenderer content={content} />);

    expect(screen.getByText("These build on one another.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Visual" })).toBeInTheDocument();
  });

  it("leaves heading ids off unless the page asks for anchors", () => {
    const { container } = render(
      <VCodeRenderer content={[{ name: "h2", properties: {}, children: ["Duration"] }]} />,
    );

    expect(container.querySelector("h2")?.id).toBe("");
  });
});
