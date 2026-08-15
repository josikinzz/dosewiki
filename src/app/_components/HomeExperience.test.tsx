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
 * Pin the flavor to dose.wiki for this file.
 *
 * `HomeExperience` reads `SITE_FLAVOR_CONFIG` at module scope — the wordmark, the
 * description and the nav ids all come from it — and takes no config prop, so there is
 * no injection point. Without this the file asserted dose.wiki's hero while inheriting
 * whatever `NEXT_PUBLIC_SITE_FLAVOR` the run happened to set, and failed under
 * `NEXT_PUBLIC_SITE_FLAVOR=effectindex` despite nothing being broken.
 *
 * `isEffectIndex` is re-defaulted rather than stubbed to `false` so it keeps its real
 * behaviour when handed an explicit config; only the ambient default moves.
 */
vi.mock("@/config/siteFlavor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/siteFlavor")>();
  return {
    ...actual,
    SITE_FLAVOR_CONFIG: actual.SITE_FLAVOR_CONFIGS.dosewiki,
    isEffectIndex: (config = actual.SITE_FLAVOR_CONFIGS.dosewiki) => actual.isEffectIndex(config),
  };
});

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

  it("keeps all five quick-link tiles, in the flavor's declared order", () => {
    render(<HomeExperience quickLinks={quickLinks} showThemeToggle={false} showPaletteLabTrigger={false} />);

    const tiles = screen.getByRole("navigation", { name: "App sections" });
    const links = Array.from(tiles.querySelectorAll("a"));

    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/substances",
      "/effects",
      "/reports",
      "/replications",
      "/about",
    ]);
    expect(links.map((link) => link.textContent)).toEqual([
      "Substances",
      "Effects",
      "Reports",
      "Replications",
      "About",
    ]);
  });

  it("splits the five tiles into centred 3 + 2 rows with row-scoped spacing", () => {
    render(<HomeExperience quickLinks={quickLinks} showThemeToggle={false} showPaletteLabTrigger={false} />);

    const tiles = screen.getByRole("navigation", { name: "App sections" });
    const rows = Array.from(tiles.children);

    // Each direct child is one centred row (`theme-home-nav-row`) that owns its
    // own column-gap, so a short last row reads as a tight centred pair instead
    // of echoing the top row's spread. At lg it flattens via `display: contents`.
    expect(rows.map((row) => row.querySelectorAll("a").length)).toEqual([3, 2]);
    for (const row of rows) {
      expect(row.className).toMatch(/theme-home-nav-row/);
    }
  });

  it("does not render any Effect Index homepage panel", () => {
    render(<HomeExperience quickLinks={quickLinks} showThemeToggle={false} showPaletteLabTrigger={false} />);

    for (const title of ["Substance Summaries", "Featured Effects", "Featured Reports"]) {
      expect(screen.queryByText(title)).toBeNull();
    }
  });
});
