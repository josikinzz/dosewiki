import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import { SiteLicenceNotice } from "./SiteLicenceNotice";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    scroll: _scroll,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    scroll?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const { dosewiki, effectindex } = SITE_FLAVOR_CONFIGS;

describe("SiteLicenceNotice", () => {
  it("keeps dose.wiki's CC0 sentence and in-app license link", () => {
    render(<SiteLicenceNotice config={dosewiki} />);

    const paragraph = screen.getByText(/Most content is public domain/);
    expect(paragraph.textContent).toBe(
      "Most content is public domain (CC0); see License & reuse for the details.",
    );

    const link = screen.getByRole("link", { name: "License & reuse" });
    expect(link).toHaveAttribute("href", "/docs/license");
    expect(link).not.toHaveAttribute("target");
  });

  it("states Effect Index's actual terms rather than dose.wiki's public-domain claim", () => {
    render(<SiteLicenceNotice config={effectindex} />);

    const paragraph = screen.getByText(/Content is licensed under/);
    expect(paragraph.textContent).toBe(
      "Content is licensed under CC BY-NC-SA 4.0 for non-commercial reuse with attribution.",
    );
    expect(paragraph.textContent).not.toMatch(/CC0|public domain/);

    const link = screen.getByRole("link", { name: "CC BY-NC-SA 4.0" });
    expect(link).toHaveAttribute("href", "https://creativecommons.org/licenses/by-nc-sa/4.0/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer license");
  });
});
