import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import type * as SiteFlavorModule from "@/config/siteFlavor";
import { ThemeProvider } from "@/context/ThemeContext";
import { clearEditorHint } from "@/lib/auth/editorHint";
import { HomeExperience } from "./HomeExperience";
import { buildHomeQuickLinks } from "./homeQuickLinks";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSelectedLayoutSegments: () => [],
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
  const actual = await importOriginal<typeof SiteFlavorModule>();
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

  afterEach(() => {
    clearEditorHint();
  });

  // The floating appearance cluster is provider-backed, so the page needs one mounted.
  // Values are explicit so the file reads the same under either build flavor.
  const renderHome = () =>
    render(
      <ThemeProvider initialColorScheme="dark" initialVisualStyle="fun" isVisualStyleLocked={false}>
        <HomeExperience quickLinks={quickLinks} />
      </ThemeProvider>,
    );

  it("renders the wordmark hero over the tile grid", () => {
    renderHome();

    const heading = screen.getByRole("heading", { level: 1 });

    expect(heading).toHaveTextContent("dose.wiki");
    expect(
      screen.getByText(SITE_FLAVOR_CONFIGS.dosewiki.description),
    ).toBeInTheDocument();
  });

  it("keeps all five quick-link tiles, in the flavor's declared order", () => {
    renderHome();

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


  it("does not render any Effect Index homepage panel", () => {
    renderHome();

    for (const title of ["Substance Summaries", "Featured Effects", "Featured Reports"]) {
      expect(screen.queryByText(title)).toBeNull();
    }
  });

  it("mounts no appearance cog of its own: the sticky header owns it", () => {
    renderHome();

    // The homepage used to float the cog bottom-right because its header collapses to a
    // hamburger. The settings button now lives in the header itself (next to that
    // hamburger, mounted by RouteChrome), so the splash carries no second mount.
    expect(screen.queryByRole("button", { name: "Appearance settings" })).not.toBeInTheDocument();
  });
});

/**
 * The retained holding surface is the homepage component with destinations blocked. These
 * tests preserve its two behavioral differences: nothing navigates, and the Theme Lab is
 * withheld.
 */
describe("dose.wiki holding surface", () => {
  const quickLinks = buildHomeQuickLinks(SITE_FLAVOR_CONFIGS.dosewiki);

  const renderBlocked = () =>
    render(
      <ThemeProvider initialColorScheme="dark" initialVisualStyle="fun" isVisualStyleLocked={false}>
        <HomeExperience
          quickLinks={quickLinks}
          isConstructionMode
        />
      </ThemeProvider>,
    );

  it("offers no route into the site: every destination is a blocked control", async () => {
    const user = userEvent.setup();
    const { container } = renderBlocked();

    // Not "no link named X" but no in-site link at all, so a newly added tile cannot
    // quietly make the blocked surface navigable.
    expect(container.querySelectorAll('a[href^="/"]')).toHaveLength(0);

    const tiles = screen.getByRole("navigation", { name: "Mock app sections" });
    const controls = within(tiles).getAllByRole("button");

    expect(controls.map((control) => control.textContent)).toEqual([
      "SOONtmSubstances",
      "SOONtmEffects",
      "SOONtmReports",
      "SOONtmReplications",
      "SOONtmAbout",
    ]);

    // The badge is the answer a press gets, so it has to be driven, not merely present.
    await user.click(controls[0]!);
    expect(controls[0]!.dataset.clicked).toBe("true");

    // The mock header mirrors the live one at its dose.wiki-home shape: brand, search,
    // settings button, hamburger — and its search field cannot be typed into either.
    expect(screen.getByRole("searchbox", { name: "Search mockup" })).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Toggle navigation" })).toBeInTheDocument();
  });


  it("does not present a future site launch", () => {
    renderBlocked();

    expect(screen.queryByText(/coming soon|launching/i)).not.toBeInTheDocument();
  });
});
