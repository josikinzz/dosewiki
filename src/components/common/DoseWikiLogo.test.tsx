import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import { DoseWikiLogo } from "./DoseWikiLogo";

vi.mock("../../assets/dosewiki-logo.svg", () => ({
  default: "/mock-dosewiki-logo.svg",
}));

const { dosewiki, effectindex } = SITE_FLAVOR_CONFIGS;

describe("DoseWikiLogo", () => {
  it("masks with the bundled dose.wiki asset and labels it as before", () => {
    render(<DoseWikiLogo config={dosewiki} width={40} height={40} />);

    const mark = screen.getByRole("img", { name: "dose.wiki logo" });
    expect(mark.style.maskImage).toContain("/mock-dosewiki-logo.svg");
    expect(mark).toHaveClass("theme-dosewiki-logo");
  });

  it("masks with the Effect Index eye and uses the Effect Index label", () => {
    render(<DoseWikiLogo config={effectindex} width={40} height={40} />);

    const mark = screen.getByRole("img", { name: "An eye, the Effect Index logo" });
    expect(mark.style.maskImage).toContain("/effectindex/logo.svg");
  });

  it("still lets a call site override the label", () => {
    render(<DoseWikiLogo config={effectindex} alt="Custom" width={10} height={10} />);

    expect(screen.getByRole("img", { name: "Custom" })).toBeInTheDocument();
  });

  it("drops the accessible name entirely when decorative", () => {
    const { container } = render(<DoseWikiLogo config={effectindex} ariaHidden width={10} height={10} />);

    const mark = container.querySelector("span.theme-dosewiki-logo");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).not.toHaveAttribute("aria-label");
  });
});
