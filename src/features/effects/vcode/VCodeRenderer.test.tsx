import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VCodeRenderer } from "./VCodeRenderer";

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
    expect(screen.getByRole("link", { name: "[1]" })).toHaveAttribute("href", "#cite-1");
    expect(container.textContent).not.toContain("[p]");
    expect(container.textContent).not.toContain("[ref");
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
});
