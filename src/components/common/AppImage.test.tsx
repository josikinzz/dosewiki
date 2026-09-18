import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MANAGED_MEDIA_HOST } from "../../../lib/next/r2ImagePolicy";
import { AppImage } from "./AppImage";

const original = `https://${MANAGED_MEDIA_HOST}/media/sha256/ab/${"ab".padEnd(64, "0")}.webp`;

describe("AppImage responsive Worker delivery", () => {
  it("emits only public Worker width candidates and preserves responsive layout attributes", () => {
    render(<AppImage
      src={original}
      alt="Artwork"
      width={1600}
      height={1000}
      sizes="(max-width: 639px) 50vw, 320px"
      className="object-cover"
      style={{ aspectRatio: "8 / 5", width: "100%", height: "auto" }}
      loading="eager"
      draggable={false}
      title="Artist credit"
    />);
    const image = screen.getByRole("img", { name: "Artwork" });
    expect(image.getAttribute("srcset")!.split(", ")).toEqual(
      [64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840]
        .map((width) => `${original}?width=${width} ${width}w`),
    );
    expect(image).toHaveAttribute("src", `${original}?width=3840`);
    expect(image).toHaveAttribute("sizes", "(max-width: 639px) 50vw, 320px");
    expect(image).toHaveAttribute("width", "1600");
    expect(image).toHaveAttribute("height", "1000");
    expect(image).toHaveClass("object-cover");
    expect(image).toHaveStyle({ aspectRatio: "8 / 5", width: "100%", height: "auto" });
    expect(image).toHaveAttribute("loading", "eager");
    expect(image).toHaveAttribute("draggable", "false");
    expect(image).toHaveAttribute("title", "Artist credit");
  });

  it("rounds fixed-size density candidates up to supported Worker widths", () => {
    render(<AppImage src={original} alt="Artist" width={76} height={76} priority loading="lazy" />);
    const image = screen.getByRole("img", { name: "Artist" });
    expect(image).toHaveAttribute("srcset", `${original}?width=96 1x, ${original}?width=256 2x`);
    expect(image).toHaveAttribute("src", `${original}?width=256`);
    expect(image).toHaveAttribute("loading", "eager");
    expect(image).toHaveAttribute("fetchpriority", "high");
  });

  it("caps oversized fixed images at the largest supported rendition without duplicate candidates", () => {
    render(<AppImage src={original} alt="Large artwork" width={5000} height={3000} />);
    const image = screen.getByRole("img", { name: "Large artwork" });
    expect(image).toHaveAttribute("srcset", `${original}?width=3840 1x`);
    expect(image).toHaveAttribute("src", `${original}?width=3840`);
  });

  it("retains guarded original bytes when the full-fidelity viewer opts out", () => {
    render(<AppImage src={original} alt="Original" width={1600} height={1000} unoptimized />);
    const image = screen.getByRole("img", { name: "Original" });
    expect(image).toHaveAttribute("src", original);
    expect(image).not.toHaveAttribute("srcset");
  });

  it("leaves legacy, foreign and animated media direct rather than fabricating guarded variants", () => {
    const sources = {
      Legacy: "https://pub-879bfd45a9774f1c80a8b77aca1f0aee.r2.dev/art.webp",
      External: "https://foreign.example/art.webp",
      Animation: original.replace(".webp", ".gif"),
    };
    render(<>{Object.entries(sources).map(([alt, src]) => (
      <AppImage key={alt} src={src} alt={alt} width={100} height={100} sizes="100vw" />
    ))}</>);
    for (const [alt, src] of Object.entries(sources)) {
      const image = screen.getByRole("img", { name: alt });
      expect(image).toHaveAttribute("src", src);
      expect(image).not.toHaveAttribute("srcset");
    }
  });
});
