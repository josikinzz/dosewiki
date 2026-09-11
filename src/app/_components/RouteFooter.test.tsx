import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as SiteFlavorModule from "@/config/siteFlavor";
import { ThemeProvider } from "@/context/ThemeContext";
import { RouteChrome, RouteFooter } from "./RouteChrome";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => navigation.pathname,
  useSelectedLayoutSegments: () => [],
}));

// Pinned to dose.wiki: the homepage footer and hamburger rules are that flavor's.
vi.mock("@/config/siteFlavor", async (importOriginal) => {
  const actual = await importOriginal<typeof SiteFlavorModule>();
  return {
    ...actual,
    SITE_FLAVOR_CONFIG: actual.SITE_FLAVOR_CONFIGS.dosewiki,
    isEffectIndex: (config = actual.SITE_FLAVOR_CONFIGS.dosewiki) => actual.isEffectIndex(config),
  };
});

vi.mock("@/components/common/Icon", () => ({
  Icon: () => null,
}));

function renderChrome(pathname: string) {
  navigation.pathname = pathname;
  return render(
    <ThemeProvider initialColorScheme="dark" initialVisualStyle="fun">
      <RouteChrome />
      <RouteFooter />
    </ThemeProvider>,
  );
}

/**
 * Next prerenders the root page as `/index`, and a Vercel ISR regeneration of the
 * root renders under that name, so the server-rendered chrome sees `/index` where
 * the hydrated router sees `/`. Both spellings must produce the same shell or the
 * HTML ships a footer and desktop nav that hydration then tears out of the homepage.
 */
describe("homepage chrome under Next's internal `/index` name", () => {
  afterEach(() => {
    navigation.pathname = "/";
  });

  it.each(["/", "/index"])("renders no footer and a collapsed nav at %s", (pathname) => {
    const { container } = renderChrome(pathname);

    expect(container.querySelector(".app-footer")).toBeNull();
    // Home collapses the desktop nav to the hamburger: its wrapper is plain `hidden`
    // with no `lg:flex` to bring it back at desktop widths.
    expect(container.querySelector("header nav")?.parentElement?.className).toBe("hidden");
  });

  it("keeps the footer and desktop nav on an ordinary page", () => {
    const { container } = renderChrome("/substances");

    expect(container.querySelector(".app-footer")).not.toBeNull();
    expect(container.querySelector("header nav")?.parentElement?.className).toContain("lg:flex");
  });
});
