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
});
