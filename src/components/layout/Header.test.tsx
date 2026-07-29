import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { forwardRef } from "react";
import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SITE_FLAVOR_CONFIG, SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import { getRouteChromeModel } from "@/utils/routeChrome";
import { Header } from "./Header";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === "string" && href.length > 0 ? href : "/"} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({
    alt,
    src,
    width,
    height,
    priority: _priority,
    ...props
  }: {
    alt: string;
    src: string;
    width: number;
    height: number;
    priority?: boolean;
  }) => <img alt={alt} src={src} width={width} height={height} {...props} />,
}));

vi.mock("next/dynamic", () => ({
  default: () => {
    const MockGlobalSearch: ComponentType<{ currentView: { type: string } }> = ({ currentView }) => (
      <div data-testid="global-search" data-current-view={currentView.type} />
    );
    return MockGlobalSearch;
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: forwardRef<
    HTMLButtonElement,
    {
      children: ReactNode;
      asChild?: boolean;
    } & React.ButtonHTMLAttributes<HTMLButtonElement>
  >(function MockButton({ children, asChild, ...props }, ref) {
    return asChild ? children : <button ref={ref} {...props}>{children}</button>;
  }),
}));

// Flavors are passed explicitly rather than through the environment: the suite runs under
// the dose.wiki build, and both publications' headers must be assertable from it.
const DOSEWIKI = SITE_FLAVOR_CONFIGS.dosewiki;
const EFFECT_INDEX = SITE_FLAVOR_CONFIGS.effectindex;

describe("Header", () => {
  it("renders supplied model hrefs and active grouping", () => {
    render(<Header model={getRouteChromeModel("/mechanism/5-ht2a-agonist")} onNavigate={vi.fn()} />);

    expect(document.querySelector(".app-header > div")).toHaveAttribute("data-nosnippet");
    // The brand link's accessible name is the logo label plus the wordmark, both of
    // which are flavored, so assert against the active flavor rather than a literal.
    expect(
      screen.getByRole("link", {
        name: `${SITE_FLAVOR_CONFIG.logo.alt}${SITE_FLAVOR_CONFIG.name}`,
      }),
    ).toHaveAttribute("href", "/");
    expect(screen.getByTestId("global-search")).toHaveAttribute("data-current-view", "mechanism");
    expect(screen.getByRole("link", { name: "Substances" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Effects" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Reports" })).not.toHaveAttribute("aria-current");
  });

  it("keeps dose.wiki's nav flat: every top-level item is a link, no disclosure buttons", () => {
    render(<Header model={getRouteChromeModel("/", null, DOSEWIKI)} onNavigate={vi.fn()} />);

    for (const label of ["Substances", "Effects", "Reports", "About"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: new RegExp(label) })).not.toBeInTheDocument();
    }
    // The submenu path stays inert: nothing to expand, nothing to pop over.
    expect(screen.queryAllByRole("menu")).toHaveLength(0);
    expect(document.querySelectorAll("[aria-expanded]")).toHaveLength(1); // the hamburger only
    expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
  });

  describe("Effect Index dropdowns", () => {
    const mobileSheet = () => {
      const sheet = document.getElementById("mobile-nav");
      if (sheet === null) {
        throw new Error("the mobile sheet is not open");
      }

      return sheet;
    };

    const renderEffectIndex = (pathname = "/") =>
      render(
        <Header model={getRouteChromeModel(pathname, null, EFFECT_INDEX)} onNavigate={vi.fn()} />,
      );

    it("renders the original tree as closed disclosure buttons", () => {
      renderEffectIndex();

      // Home has no children, so it stays a link; the four umbrellas become buttons.
      expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
      for (const label of ["Effects", "Replications", "Trip Reports", "Project"]) {
        const button = screen.getByRole("button", { name: label });
        expect(button).toHaveAttribute("aria-haspopup", "true");
        expect(button).toHaveAttribute("aria-expanded", "false");
      }
      expect(screen.queryAllByRole("menu")).toHaveLength(0);
      // Substances is advertised nowhere in the header.
      expect(screen.queryByRole("link", { name: "Substances" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Substances" })).not.toBeInTheDocument();
    });

    it("opens a dropdown on click and closes it on a second click", async () => {
      const user = userEvent.setup();
      renderEffectIndex();
      const button = screen.getByRole("button", { name: "Effects" });

      await user.click(button);

      expect(button).toHaveAttribute("aria-expanded", "true");
      const menu = screen.getByRole("menu");
      expect(button).toHaveAttribute("aria-controls", menu.id);
      expect(
        within(menu)
          .getAllByRole("menuitem")
          .map((item) => [item.textContent, item.getAttribute("href")]),
      ).toEqual([
        ["Index", "/effects"],
        ["Sensory", "/effects#sensory"],
        ["Cognitive", "/effects#cognitive"],
        ["Physical", "/effects#physical"],
      ]);

      await user.click(button);

      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryAllByRole("menu")).toHaveLength(0);
    });

    it("opens only one dropdown at a time", async () => {
      const user = userEvent.setup();
      renderEffectIndex();

      await user.click(screen.getByRole("button", { name: "Effects" }));
      await user.click(screen.getByRole("button", { name: "Project" }));

      expect(screen.getByRole("button", { name: "Effects" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      expect(screen.getByRole("button", { name: "Project" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    });

    it("opens external children in a new tab and says so", async () => {
      const user = userEvent.setup();
      renderEffectIndex();

      await user.click(screen.getByRole("button", { name: "Project" }));
      const github = screen.getByRole("menuitem", { name: /Github/ });

      expect(github).toHaveAttribute("href", "https://github.com/josikinzz/EffectIndex2.0");
      expect(github).toHaveAttribute("target", "_blank");
      expect(github).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
      expect(github).toHaveAccessibleName("Github (opens in a new tab)");
      // Internal children navigate in place.
      expect(screen.getByRole("menuitem", { name: "Articles" })).not.toHaveAttribute("target");
    });

    it("is keyboard operable: arrows move focus, Escape closes and restores it", async () => {
      const user = userEvent.setup();
      renderEffectIndex();
      const button = screen.getByRole("button", { name: "Replications" });

      button.focus();
      await user.keyboard("{ArrowDown}");

      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("menuitem", { name: "Gallery" })).toHaveFocus();

      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("menuitem", { name: "Audio" })).toHaveFocus();

      await user.keyboard("{End}");
      expect(screen.getByRole("menuitem", { name: "Tutorials" })).toHaveFocus();

      await user.keyboard("{ArrowDown}");
      // Wraps around rather than trapping focus at the end.
      expect(screen.getByRole("menuitem", { name: "Gallery" })).toHaveFocus();

      await user.keyboard("{ArrowUp}");
      expect(screen.getByRole("menuitem", { name: "Tutorials" })).toHaveFocus();

      await user.keyboard("{Escape}");
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(button).toHaveFocus();
    });

    it("opens upwards from the button with ArrowUp", async () => {
      const user = userEvent.setup();
      renderEffectIndex();

      screen.getByRole("button", { name: "Effects" }).focus();
      await user.keyboard("{ArrowUp}");

      expect(screen.getByRole("menuitem", { name: "Physical" })).toHaveFocus();
    });

    it("closes when the reader clicks outside the nav", async () => {
      const user = userEvent.setup();
      renderEffectIndex();
      const button = screen.getByRole("button", { name: "Effects" });

      await user.click(button);
      await user.click(document.body);

      expect(button).toHaveAttribute("aria-expanded", "false");
    });

    it("closes when a child is chosen", async () => {
      const user = userEvent.setup();
      renderEffectIndex();
      const button = screen.getByRole("button", { name: "Effects" });

      await user.click(button);
      await user.click(screen.getByRole("menuitem", { name: "Sensory" }));

      expect(button).toHaveAttribute("aria-expanded", "false");
    });

    describe("fragment children", () => {
      // Next resolves a hash-only navigation inside its router state (pushState, no event), so
      // a fragment link followed from the page it points into would change the URL and notify
      // nothing. These clicks are handed to the browser instead.
      const clickCapturingDefault = async (
        user: ReturnType<typeof userEvent.setup>,
        element: HTMLElement,
      ) => {
        let defaultPrevented: boolean | null = null;
        const listener = (event: MouseEvent) => {
          defaultPrevented = event.defaultPrevented;
        };

        document.addEventListener("click", listener);
        await user.click(element);
        document.removeEventListener("click", listener);

        return defaultPrevented;
      };

      afterEach(() => {
        window.history.replaceState(null, "", "/");
      });

      it("performs a native fragment navigation when already on the target page", async () => {
        const user = userEvent.setup();
        window.history.replaceState(null, "", "/effects");
        renderEffectIndex("/effects");

        await user.click(screen.getByRole("button", { name: "Effects" }));
        const prevented = await clickCapturingDefault(
          user,
          screen.getByRole("menuitem", { name: "Sensory" }),
        );

        expect(prevented).toBe(true);
        expect(window.location.pathname).toBe("/effects");
        expect(window.location.hash).toBe("#sensory");
      });

      it("announces the fragment the URL already carries so the click is never dead", async () => {
        const user = userEvent.setup();
        window.history.replaceState(null, "", "/effects#sensory");
        renderEffectIndex("/effects");
        const announced: string[] = [];
        const listener = () => announced.push(window.location.hash);
        window.addEventListener("hashchange", listener);

        try {
          await user.click(screen.getByRole("button", { name: "Effects" }));
          await user.click(screen.getByRole("menuitem", { name: "Sensory" }));
        } finally {
          window.removeEventListener("hashchange", listener);
        }

        expect(announced).toEqual(["#sensory"]);
        expect(window.location.hash).toBe("#sensory");
      });

      it("leaves cross-page fragment links to the router", async () => {
        const user = userEvent.setup();
        window.history.replaceState(null, "", "/reports");
        renderEffectIndex("/reports");

        await user.click(screen.getByRole("button", { name: "Effects" }));
        const prevented = await clickCapturingDefault(
          user,
          screen.getByRole("menuitem", { name: "Cognitive" }),
        );

        // The router navigates and the effects page reads the fragment as it mounts.
        expect(prevented).toBe(false);
        expect(window.location.hash).toBe("");
      });

      it("leaves fragmentless children to the router", async () => {
        const user = userEvent.setup();
        window.history.replaceState(null, "", "/effects");
        renderEffectIndex("/effects");

        await user.click(screen.getByRole("button", { name: "Effects" }));
        const prevented = await clickCapturingDefault(
          user,
          screen.getByRole("menuitem", { name: "Index" }),
        );

        expect(prevented).toBe(false);
        expect(window.location.hash).toBe("");
      });

      it("lets the browser handle a modified click", async () => {
        const user = userEvent.setup();
        window.history.replaceState(null, "", "/effects");
        renderEffectIndex("/effects");

        await user.click(screen.getByRole("button", { name: "Effects" }));
        const prevented = await clickCapturingDefault(
          user,
          screen.getByRole("menuitem", { name: "Physical" }),
        );
        window.history.replaceState(null, "", "/effects");

        // Sanity check on the helper before the modified-click assertion below.
        expect(prevented).toBe(true);

        let modifiedPrevented: boolean | null = null;
        const listener = (event: MouseEvent) => {
          modifiedPrevented = event.defaultPrevented;
        };
        document.addEventListener("click", listener);
        await user.keyboard("[MetaLeft>]");
        await user.click(screen.getByRole("button", { name: "Effects" }));
        await user.click(screen.getByRole("menuitem", { name: "Physical" }));
        await user.keyboard("[/MetaLeft]");
        document.removeEventListener("click", listener);

        // Cmd-click must open a tab, not hijack the current one.
        expect(modifiedPrevented).toBe(false);
      });
    });

    it("marks the section the reader is in without pointing the button at a page", () => {
      renderEffectIndex("/replications/audio");

      const button = screen.getByRole("button", { name: "Replications" });
      expect(button).toHaveAttribute("data-active", "true");
      expect(button).toHaveAttribute("aria-current", "true");
      expect(screen.getByRole("button", { name: "Effects" })).not.toHaveAttribute("aria-current");
    });

    it("expands rather than navigates in the mobile sheet", async () => {
      const user = userEvent.setup();
      render(
        <Header
          model={getRouteChromeModel("/", null, EFFECT_INDEX)}
          onNavigate={vi.fn()}
          forceMobileNav
        />,
      );

      await user.click(screen.getByRole("button", { name: "Toggle navigation" }));
      // `forceMobileNav` only hides the desktop bar with a class, so queries have to be
      // scoped to the sheet or they match both copies of every label.
      const sheet = mobileSheet();
      const parent = within(sheet).getByRole("button", { name: "Trip Reports" });

      expect(parent).toHaveAttribute("aria-expanded", "false");
      expect(within(sheet).queryByRole("link", { name: "Trip Reports" })).not.toBeInTheDocument();

      await user.click(parent);

      expect(parent).toHaveAttribute("aria-expanded", "true");
      // The self-child is what keeps /reports reachable once the parent stops being a link.
      const child = within(sheet).getByRole("link", { name: "Trip Reports" });
      expect(child).toHaveAttribute("href", "/reports");
      expect(document.getElementById(parent.getAttribute("aria-controls") ?? "")).toContainElement(
        child,
      );

      await user.click(parent);
      expect(parent).toHaveAttribute("aria-expanded", "false");
    });

    it("closes the mobile sheet, and forgets what was expanded, once a child is chosen", async () => {
      const user = userEvent.setup();
      render(
        <Header
          model={getRouteChromeModel("/", null, EFFECT_INDEX)}
          onNavigate={vi.fn()}
          forceMobileNav
        />,
      );

      await user.click(screen.getByRole("button", { name: "Toggle navigation" }));
      await user.click(within(mobileSheet()).getByRole("button", { name: "Project" }));
      await user.click(within(mobileSheet()).getByRole("link", { name: "Articles" }));

      expect(document.getElementById("mobile-nav")).toBeNull();

      await user.click(screen.getByRole("button", { name: "Toggle navigation" }));

      // Reopening starts collapsed rather than restoring the previous expansion.
      expect(within(mobileSheet()).getByRole("button", { name: "Project" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });
  });
});
