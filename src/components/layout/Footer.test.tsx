import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { getRouteChromeModel } from "@/utils/routeChrome";
import { Footer } from "./Footer";
import { ThemeProvider } from "../../context/ThemeContext";

vi.mock("../common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-testid="icon">{icon}</span>,
}));

/**
 * The provider wrapper is habit rather than need — the footer's appearance cog moved
 * to the sticky header, so nothing in this subtree reads theme state anymore; the
 * wrapper stays so this file keeps reading the same under either build flavor.
 */
function renderFooter() {
  return render(
    <ThemeProvider initialColorScheme="dark" initialVisualStyle="fun">
      <Footer model={getRouteChromeModel("/dev/profile", null, SITE_FLAVOR_CONFIG)} />
    </ThemeProvider>,
  );
}

describe("Footer", () => {
  it("renders the updated footer copy and action buttons", () => {
    renderFooter();

    expect(document.querySelector(".app-footer > div")).toHaveAttribute("data-nosnippet");
    expect(screen.queryByText("Harm reduction reference")).not.toBeInTheDocument();
    // The tagline is now a two-paragraph disclaimer rendered as separate <p> nodes,
    // so assert each paragraph rather than the joined string.
    for (const paragraph of SITE_FLAVOR_CONFIG.footer.tagline.split("\n\n")) {
      expect(screen.getByText(paragraph)).toBeInTheDocument();
    }
    // Reuse rights are a per-publication legal statement; assert the flavor's own wording.
    expect(
      screen.getByRole("link", { name: SITE_FLAVOR_CONFIG.footer.licence.linkLabel }),
    ).toHaveAttribute("href", SITE_FLAVOR_CONFIG.footer.licence.linkHref);
    expect(screen.queryByRole("link", { name: /About/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dev tools" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "dose.wiki GitHub" })).not.toBeInTheDocument();
  });

  it("carries no appearance control: the settings button lives in the sticky header", () => {
    renderFooter();

    // The footer cog was a second mount of the header's popover; one mount, one source
    // of truth. Header.test.tsx owns the button's placement and behavior cases.
    expect(
      screen.queryByRole("button", { name: "Appearance settings" }),
    ).not.toBeInTheDocument();
  });
});
