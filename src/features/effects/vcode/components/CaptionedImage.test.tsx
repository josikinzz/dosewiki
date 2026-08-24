import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaptionedImage } from "./CaptionedImage";

vi.mock("@/components/common/AppImage", () => ({
  AppImage: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} />
  ),
}));

describe("CaptionedImage", () => {
  it("applies explicit auto side margins for centered effect article images", () => {
    render(
      <div className="prose prose-invert prose-fuchsia">
        <CaptionedImage
          src="/img/gallery/example.jpg"
          caption="Example replication"
          align="center"
        />
      </div>,
    );

    const figure = document.querySelector("figure") as HTMLElement | null;
    expect(figure).not.toBeNull();
    expect(figure).toHaveStyle({
      marginLeft: "auto",
      marginRight: "auto",
      maxWidth: "min(100%, 48rem)",
    });
  });

  it("uses explicit width when provided", () => {
    render(
      <CaptionedImage
        src="/img/gallery/example.jpg"
        caption="Example replication"
        align="center"
        width="640"
      />,
    );

    const figure = document.querySelector("figure") as HTMLElement | null;
    expect(figure).not.toBeNull();
    expect(figure).toHaveStyle({ maxWidth: "640px" });
  });

  it("collapses floats into a centered block below sm and floats only from sm up", () => {
    render(
      <CaptionedImage
        src="/img/gallery/example.jpg"
        caption="Example replication"
        align="right"
        width="500"
      />,
    );

    const figure = document.querySelector("figure") as HTMLElement | null;
    expect(figure).not.toBeNull();
    // Base (mobile): normal flow, centered, capped to the column.
    expect(figure?.className).toContain("mx-auto");
    expect(figure?.className).toContain("max-w-full");
    expect(figure?.className).not.toMatch(/(?:^|\s)float-(?:left|right)(?:\s|$)/);
    // sm and up: the Wikipedia-style float returns, with its width cap.
    expect(figure?.className).toContain("sm:float-right");
    expect(figure?.className).toContain("sm:max-w-[var(--vcode-float-max)]");
    expect(figure?.getAttribute("style")).toContain("--vcode-float-max: 500px");
  });

  it("renders caption content in a dedicated card stack without paragraph tags", () => {
    render(
      <div className="prose prose-invert prose-fuchsia">
        <CaptionedImage
          src="/img/gallery/example.jpg"
          caption="Example replication"
          artist="Josie Kins"
          align="center"
        />
      </div>,
    );

    const figcaption = document.querySelector("figcaption") as HTMLElement | null;
    expect(figcaption).not.toBeNull();
    expect(figcaption).toHaveClass("effect-vcode-caption");
    expect(figcaption?.querySelectorAll("p")).toHaveLength(0);
    expect(figcaption).toHaveTextContent("Example replication");
    expect(figcaption).toHaveTextContent("by Josie Kins");
  });
});
