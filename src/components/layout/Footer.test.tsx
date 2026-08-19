import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SITE_FLAVOR_CONFIG,
  SITE_FLAVOR_CONFIGS,
  type SiteFlavorConfig,
} from "@/config/siteFlavor";
import { getRouteChromeModel } from "@/utils/routeChrome";
import { Footer } from "./Footer";
import {
  COLOR_SCHEME_STORAGE_KEY,
  ThemeProvider,
  VISUAL_STYLE_STORAGE_KEY,
} from "../../context/ThemeContext";

vi.mock("../common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-testid="icon">{icon}</span>,
}));

const DOSEWIKI = SITE_FLAVOR_CONFIGS.dosewiki;

/**
 * Appearance state is the provider's, never the control's, so every footer render
 * here mounts one. The provider values are passed explicitly rather than inherited
 * from the ambient build flavor: this file asserts control behavior, and it must
 * read the same under `NEXT_PUBLIC_SITE_FLAVOR=effectindex`.
 */
function renderFooter(
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
  { isVisualStyleLocked = false }: { isVisualStyleLocked?: boolean } = {},
) {
  return render(
    <ThemeProvider
      initialColorScheme="dark"
      initialVisualStyle="fun"
      isVisualStyleLocked={isVisualStyleLocked}
    >
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

/**
 * The footer's appearance surface is one cog; the axes live in its popover. Every case that
 * asserts an axis opens it first, and reads the axes out of the returned panel rather than
 * out of the document — the panel is portalled to <body>, so a document-wide query would
 * also see anything else a case mounted.
 */
async function openFooterCog(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Appearance settings" }));

  return screen.findByRole("dialog", { name: "Appearance" });
}

describe("Footer appearance controls", () => {
  beforeEach(() => {
    installMockStorage();
    window.localStorage.clear();
    // Pin night + Fun in both restore sources, so the control names asserted below mean
    // the same thing whichever publication flavor the suite runs under.
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, "dark");
    window.localStorage.setItem(VISUAL_STYLE_STORAGE_KEY, "fun");
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.visualStyle = "fun";
    document.documentElement.classList.remove("is-safari");
  });

  it("switches day and night through the provider and persists across remounts", async () => {
    const user = userEvent.setup();
    // A flavor that offers the control, named explicitly: the ambient build must not
    // decide whether this case has something to click.
    const firstRender = renderFooter(DOSEWIKI);

    const panel = await openFooterCog(user);
    const dayNight = within(panel).getByRole("button", { name: "Switch to day mode" });
    expect(dayNight).toHaveAttribute("aria-pressed", "false");

    await user.click(dayNight);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe("light");
      expect(screen.getByRole("button", { name: "Switch to night mode" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    firstRender.unmount();
    renderFooter(DOSEWIKI);
    const remounted = await openFooterCog(user);

    await waitFor(() => {
      expect(within(remounted).getByRole("button", { name: "Switch to night mode" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(document.documentElement.dataset.theme).toBe("light");
    });
  });

  it("keeps day/night and Fun/Pro pressed state independent", async () => {
    const user = userEvent.setup();
    renderFooter(DOSEWIKI);
    const panel = await openFooterCog(user);

    await user.click(within(panel).getByRole("button", { name: "Switch to Pro visual style" }));

    await waitFor(() => {
      expect(
        within(panel).getByRole("button", { name: "Switch to Fun visual style" }),
      ).toHaveAttribute("aria-pressed", "true");
    });
    // The scheme axis did not move with it.
    expect(within(panel).getByRole("button", { name: "Switch to day mode" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(document.documentElement.dataset.theme).not.toBe("light");

    await user.click(within(panel).getByRole("button", { name: "Switch to day mode" }));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
    });
    // …and the style axis did not move back.
    expect(
      within(panel).getByRole("button", { name: "Switch to Fun visual style" }),
    ).toHaveAttribute("aria-pressed", "true");
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

  it("drops the style row, and only that row, when the publication locks its style", async () => {
    const user = userEvent.setup();
    renderFooter(SITE_FLAVOR_CONFIGS.effectindex, { isVisualStyleLocked: true });

    const panel = await openFooterCog(user);

    // Effect Index is Pro by identity but still lets readers choose day or night.
    expect(within(panel).getByRole("button", { name: "Switch to day mode" })).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /visual style/ })).not.toBeInTheDocument();
    expect(panel.querySelectorAll("[data-appearance-axis]")).toHaveLength(1);
  });

  it("keeps the public Theme Lab drawer action inside the appearance panel", async () => {
    const user = userEvent.setup();
    renderFooter(DOSEWIKI);

    const nav = screen.getByRole("navigation");
    const buttons = within(nav).getAllByRole("button");

    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Appearance settings",
    ]);

    const panel = await openFooterCog(user);
    expect(
      within(panel).getByRole("button", { name: "Open Theme Lab" }),
    ).toHaveAttribute("aria-controls", "theme-lab-panel");
    expect(within(nav).getAllByRole("button")).toHaveLength(1);
  });
});
