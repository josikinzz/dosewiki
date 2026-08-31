import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import { SiteVersionBadge } from "./SiteVersionBadge";

const { dosewiki, effectindex } = SITE_FLAVOR_CONFIGS;

describe("SiteVersionBadge", () => {
  it("renders the full version and stage in the hero variant", () => {
    render(<SiteVersionBadge variant="hero" config={dosewiki} />);

    const badge = screen.getByLabelText("version 0.9 beta");
    expect(badge).toHaveTextContent("v0.9 beta");
  });

  it("renders the full version and stage, hidden from the accessibility tree, in the header variant", () => {
    const { container } = render(<SiteVersionBadge variant="header" config={dosewiki} />);

    const badge = container.querySelector("span");
    expect(badge).toHaveAttribute("aria-hidden", "true");
    expect(badge).toHaveTextContent("beta");
    expect(badge).toHaveTextContent("v0.9 beta");
  });

  it("renders only the version, decorative, in the logo overlay variant", () => {
    const { container } = render(
      <SiteVersionBadge variant="logoOverlay" config={dosewiki} />,
    );

    const badge = container.querySelector("span");
    expect(badge).toHaveAttribute("aria-hidden", "true");
    expect(badge).toHaveTextContent("v0.9");
    expect(badge).not.toHaveTextContent("beta");
  });

  it("renders nothing for a flavor without a version badge", () => {
    const { container } = render(
      <SiteVersionBadge variant="hero" config={effectindex} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
