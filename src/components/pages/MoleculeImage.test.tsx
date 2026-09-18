import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { MoleculeImage } from "./MoleculeImage";

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    priority,
    loading,
    unoptimized: _unoptimized,
    ...props
  }: {
    src: string;
    alt: string;
    priority?: boolean;
    loading?: "eager" | "lazy";
    unoptimized?: boolean;
  }) => (
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : loading}
      data-priority={priority ? "true" : undefined}
      {...props}
    />
  ),
}));

const DEFAULT_SCHEME = SITE_FLAVOR_CONFIG.defaultColorScheme;
const OTHER_SCHEME = DEFAULT_SCHEME === "dark" ? "light" : "dark";

describe("MoleculeImage", () => {
  it("renders both colourways so the pre-painted scheme can pick one without a src swap", () => {
    const { container } = render(
      <MoleculeImage src="/api/molecules/classes/tryptamine?v=1" alt="Structure" width={100} height={100} />,
    );

    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(2);
    expect(container.querySelector('[data-molecule-colorway="pro-dark"]')).toHaveAttribute(
      "src",
      "/api/molecules/classes/tryptamine?v=1&colorway=pro-dark",
    );
    expect(container.querySelector('[data-molecule-colorway="pro-light"]')).toHaveAttribute(
      "src",
      "/api/molecules/classes/tryptamine?v=1&colorway=pro-light",
    );
  });

  it("only lets the flavor's default scheme carry priority; the other variant stays lazy", () => {
    const { container } = render(
      <MoleculeImage src="/api/molecules/lsd?v=published" alt="Structure" width={256} height={256} priority />,
    );

    const preferred = container.querySelector(`[data-molecule-colorway="pro-${DEFAULT_SCHEME}"]`);
    const other = container.querySelector(`[data-molecule-colorway="pro-${OTHER_SCHEME}"]`);
    expect(preferred).toHaveAttribute("data-priority", "true");
    expect(preferred).toHaveAttribute("loading", "eager");
    expect(other).not.toHaveAttribute("data-priority");
    expect(other).toHaveAttribute("loading", "lazy");
  });
});
