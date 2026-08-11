import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SITE_FLAVOR_CONFIG,
  SITE_FLAVOR_CONFIGS,
  type SiteFlavorConfig,
} from "@/config/siteFlavor";
import { getRouteChromeModel } from "@/utils/routeChrome";
import { Footer } from "./Footer";
import {
  THEME_STORAGE_KEY,
  ThemeProvider,
} from "../../context/ThemeContext";

vi.mock("../common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-testid="icon">{icon}</span>,
}));

vi.mock("@/features/theme-lab", () => ({
  PaletteLabTrigger: () => <button type="button" aria-label="Open Theme Lab" />,
}));

const DOSEWIKI = SITE_FLAVOR_CONFIGS.dosewiki;

function renderFooter(config: SiteFlavorConfig = SITE_FLAVOR_CONFIG) {
  return render(
    <ThemeProvider>
      <Footer model={getRouteChromeModel("/dev/profile", null, config)} />
    </ThemeProvider>,
  );
}

function installMockStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });

  return storage;
}

describe("Footer theme toggle", () => {
  beforeEach(() => {
    installMockStorage();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("is-safari");
  });

  it("toggles to light mode and persists across remounts", async () => {
    const user = userEvent.setup();
    // A flavor that offers the toggle, named explicitly: the theme-locked flavor has no
    // toggle to click, and this case is about the toggle, not about the ambient build.
    const firstRender = renderFooter(DOSEWIKI);

    const toggle = screen.getByRole("button", { name: "Switch to light mode" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
      expect(screen.getByRole("button", { name: "Switch to dark mode" })).toHaveAttribute("aria-pressed", "true");
    });

    firstRender.unmount();
    renderFooter(DOSEWIKI);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Switch to dark mode" })).toHaveAttribute("aria-pressed", "true");
      expect(document.documentElement.dataset.theme).toBe("light");
    });
  });

  it("renders the updated footer copy and action buttons", () => {
    renderFooter();

    expect(document.querySelector(".app-footer > div")).toHaveAttribute("data-nosnippet");
    expect(screen.queryByText("Harm reduction reference")).not.toBeInTheDocument();
    expect(screen.getByText(SITE_FLAVOR_CONFIG.footer.tagline)).toBeInTheDocument();
    // Reuse rights are a per-publication legal statement; assert the flavor's own wording.
    expect(
      screen.getByRole("link", { name: SITE_FLAVOR_CONFIG.footer.licence.linkLabel }),
    ).toHaveAttribute("href", SITE_FLAVOR_CONFIG.footer.licence.linkHref);
    expect(screen.queryByRole("link", { name: /About/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dev tools" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "dose.wiki GitHub" })).not.toBeInTheDocument();
  });

  it("offers neither the toggle nor the Theme Lab on a theme-locked flavor", () => {
    render(
      <Footer
        model={getRouteChromeModel("/", null, SITE_FLAVOR_CONFIGS.effectindex)}
        showPaletteLabTrigger={false}
      />,
    );

    expect(screen.queryByRole("button", { name: /Switch to .* mode/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Theme Lab" })).not.toBeInTheDocument();
  });
});
