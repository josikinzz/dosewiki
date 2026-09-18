import { render, screen } from "@testing-library/react";
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
      <div className="prose prose-fuchsia">
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

  it("caps a floated figure through its width variable and leaves the base flow uncentered", () => {
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
    // The float cap is published as a variable so it can bind only from `sm`
    // up; the inline style must not force the centered-layout margins or cap,
    // which would override the mobile fallback.
    expect(figure?.style.getPropertyValue("--vcode-float-max")).toBe("500px");
    expect(figure?.style.maxWidth).toBe("");
    expect(figure?.style.marginLeft).toBe("");
    expect(figure?.style.marginRight).toBe("");
  });

  it("defaults a floated figure to a proportional cap when no width is given", () => {
    render(
      <CaptionedImage src="/img/gallery/example.jpg" caption="Example replication" align="left" />,
    );

    const figure = document.querySelector("figure") as HTMLElement | null;
    expect(figure?.style.getPropertyValue("--vcode-float-max")).toBe("min(350px, 40%)");
  });

  it("renders caption and credit as plain caption text without paragraph tags", () => {
    render(
      <div className="prose prose-fuchsia">
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
    expect(figcaption?.querySelectorAll("p")).toHaveLength(0);
    expect(figcaption).toHaveTextContent("Example replication");
    expect(figcaption).toHaveTextContent("by Josie Kins");
    expect(figcaption?.closest("figure")).toBe(document.querySelector("figure"));
  });

  it("omits the caption entirely when there is nothing to say", () => {
    render(<CaptionedImage src="/img/gallery/example.jpg" />);

    expect(document.querySelector("figcaption")).toBeNull();
  });

  it("rewrites gallery paths to the CDN and names the image from its title, caption, or a fallback", () => {
    const { rerender } = render(
      <CaptionedImage src="/img/gallery/my image.jpg" caption="Caption text" title="Title text" />,
    );
    expect(screen.getByRole("img", { name: "Title text" })).toHaveAttribute(
      "src",
      "https://pub-879bfd45a9774f1c80a8b77aca1f0aee.r2.dev/my%20image.jpg",
    );

    rerender(<CaptionedImage src="/img/plain.jpg" caption="Caption text" />);
    expect(screen.getByRole("img", { name: "Caption text" })).toHaveAttribute(
      "src",
      "https://pub-879bfd45a9774f1c80a8b77aca1f0aee.r2.dev/plain.jpg",
    );

    rerender(<CaptionedImage src="https://cdn.example.com/kept.jpg" />);
    expect(screen.getByRole("img", { name: "Effect replication" })).toHaveAttribute(
      "src",
      "https://cdn.example.com/kept.jpg",
    );
  });

  it("renders nothing without a source", () => {
    const { container } = render(<CaptionedImage caption="Orphan caption" />);

    expect(container).toBeEmptyDOMElement();
  });
});
