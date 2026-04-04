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
