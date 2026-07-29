import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import { HomeExperience } from "./HomeExperience";
import { buildHomeQuickLinks } from "./homeQuickLinks";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

/**
 * dose.wiki's homepage is the centred wordmark over the app-tile grid, and it is not
 * supposed to move: the Effect Index build swaps in its own panel layout at the route level
 * (`src/app/page.tsx`) rather than by changing anything here.
 */
describe("dose.wiki homepage", () => {
  const quickLinks = buildHomeQuickLinks(SITE_FLAVOR_CONFIGS.dosewiki);

  it("renders the wordmark hero over the tile grid", () => {
    render(<HomeExperience quickLinks={quickLinks} showThemeToggle={false} showPaletteLabTrigger={false} />);

    const heading = screen.getByRole("heading", { level: 1 });

    expect(heading).toHaveTextContent("dose.wiki");
    expect(heading.className).toMatch(/theme-home-wordmark/);
    expect(
      screen.getByText(SITE_FLAVOR_CONFIGS.dosewiki.description),
    ).toBeInTheDocument();
  });

  it("keeps all four quick-link tiles, in the flavor's declared order", () => {
    render(<HomeExperience quickLinks={quickLinks} showThemeToggle={false} showPaletteLabTrigger={false} />);

    const tiles = screen.getByRole("navigation", { name: "App sections" });
    const links = Array.from(tiles.querySelectorAll("a"));

    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/substances",
      "/effects",
      "/reports",
      "/about",
    ]);
    expect(links.map((link) => link.textContent)).toEqual([
      "Substances",
      "Effects",
      "Reports",
      "About",
    ]);
  });

  it("does not render any Effect Index homepage panel", () => {
    render(<HomeExperience quickLinks={quickLinks} showThemeToggle={false} showPaletteLabTrigger={false} />);

    for (const title of ["Substance Summaries", "Featured Effects", "Featured Reports"]) {
      expect(screen.queryByText(title)).toBeNull();
    }
  });
});
