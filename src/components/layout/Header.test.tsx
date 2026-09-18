import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { forwardRef } from "react";
import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import { getRouteChromeModel } from "@/utils/routeChrome";
import { ThemeProvider } from "../../context/ThemeContext";
import { Header } from "./Header";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === "string" && href.length > 0 ? href : "/"} {...props}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
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

vi.mock("../common/GlobalSearch", () => {
  const MockGlobalSearch: ComponentType<{ currentView: { type: string } }> = ({ currentView }) => (
    <div data-testid="global-search" data-current-view={currentView.type} />
  );
  return { GlobalSearch: MockGlobalSearch };
});

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

/**
 * The header mounts the appearance settings button, which reads the theme context, so
 * every render here mounts the provider it needs. Values pinned rather than inherited,
 * on the same reasoning as the flavor pins above.
 */
function renderHeader(ui: ReactNode) {
  return render(
    <ThemeProvider initialColorScheme="dark" initialVisualStyle="fun" isVisualStyleLocked={false} isFontLocked={false}>
      {ui}
    </ThemeProvider>,
  );
}

describe("Header", () => {
  it("renders supplied model hrefs and active grouping", () => {
    // Pinned to dose.wiki rather than the ambient flavor. This case asserts
    // dose.wiki's nav shape — Substances/Effects/Reports — which the Effect Index
    // flavor does not have, so inheriting the environment made the whole file fail
    // under `NEXT_PUBLIC_SITE_FLAVOR=effectindex` even though nothing was broken.
    renderHeader(
      <Header model={getRouteChromeModel("/mechanism/5-ht2a-agonist", null, DOSEWIKI)} onNavigate={vi.fn()} />,
    );

    expect(document.querySelector(".app-header > div")).toHaveAttribute("data-nosnippet");
    // The publication brand is the home affordance regardless of which explicit
    // route model is under test.
    expect(screen.getByRole("img", { name: /logo$/ }).closest("a")).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByTestId("global-search")).toHaveAttribute("data-current-view", "mechanism");
    expect(screen.getByRole("link", { name: "Substances" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Effects" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Reports" })).not.toHaveAttribute("aria-current");
  });

  it("keeps dose.wiki's nav flat: every top-level item is a link, no disclosure buttons", () => {
    renderHeader(<Header model={getRouteChromeModel("/", null, DOSEWIKI)} onNavigate={vi.fn()} />);

    for (const label of ["Substances", "Effects", "Reports", "About"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: new RegExp(label) })).not.toBeInTheDocument();
    }
    // The submenu path stays inert: nothing to expand, nothing to pop over.
    expect(screen.queryAllByRole("menu")).toHaveLength(0);
    // The hamburger plus the two appearance settings mounts (desktop bar and mobile
    // cluster) — Radix puts aria-expanded on each popover trigger.
    expect(document.querySelectorAll("[aria-expanded]")).toHaveLength(3);
    expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
  });

  describe("appearance settings button", () => {
    it("separates settings after About on desktop and keeps it left of the mobile hamburger", () => {
      renderHeader(<Header model={getRouteChromeModel("/", null, DOSEWIKI)} onNavigate={vi.fn()} />);

      // Two mounts of one popover: the desktop bar's and the mobile cluster's. Only one
      // is ever visible — the bars trade places at lg — but jsdom runs no media queries,
      // so both are in the tree, in that order.
      const cogs = screen.getAllByRole("button", { name: "Appearance settings" });
      expect(cogs).toHaveLength(2);

      // Desktop: About, then the utility divider, then the flat settings icon.
      const about = screen.getByRole("link", { name: "About" });
      const divider = document.querySelector<HTMLElement>(".theme-divider");
      expect(divider).not.toBeNull();
      expect(about.compareDocumentPosition(divider!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(divider!.compareDocumentPosition(cogs[0]!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(cogs[0]!.parentElement).not.toBeNull();
      expect(cogs[0]!.parentElement!).toContainElement(about);

      // Mobile: settings precedes the hamburger so navigation owns the top-right corner.
      const hamburger = screen.getByRole("button", { name: "Toggle navigation" });
      expect(cogs[1]!.compareDocumentPosition(hamburger)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it("opens the panel the footer cog and homepage FAB used to open, and closes on a second press", async () => {
      const user = userEvent.setup();
      renderHeader(<Header model={getRouteChromeModel("/", null, DOSEWIKI)} onNavigate={vi.fn()} />);

      await user.click(screen.getAllByRole("button", { name: "Appearance settings" })[0]!);
      const panel = await screen.findByRole("dialog", { name: "Appearance settings" });

      expect(
        await within(panel).findByRole("button", { name: "Show font controls" }),
      ).toBeInTheDocument();

      await user.click(screen.getAllByRole("button", { name: "Appearance settings" })[0]!);
      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "Appearance settings" })).not.toBeInTheDocument();
      });
    });
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
      renderHeader(
        <Header model={getRouteChromeModel(pathname, null, EFFECT_INDEX)} onNavigate={vi.fn()} />,
      );

    /**
     * The disclosure control is a button of its own, named after its action — the section name
     * belongs to the link beside it.
     */
    const chevronFor = (label: string, scope?: HTMLElement) =>
      (scope ? within(scope) : screen).getByRole("button", { name: `Show ${label} submenu` });

    /** Clicks a real link without letting jsdom attempt the navigation it cannot perform. */
    const clickWithoutNavigating = async (
      user: ReturnType<typeof userEvent.setup>,
      element: HTMLElement,
    ) => {
      const swallow = (event: MouseEvent) => event.preventDefault();

      document.addEventListener("click", swallow);
      try {
        await user.click(element);
      } finally {
        document.removeEventListener("click", swallow);
      }
    };

    it("renders each parent as a label link beside its own disclosure chevron", () => {
      renderEffectIndex();

      // No Home item: the brand link beside the nav is the route home, on every page and at
      // every width, so an entry for it would be a second copy of the same destination.
      expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
      // The publication brand remains the route home beside the explicit Effect
      // Index navigation model.
      expect(screen.getByRole("img", { name: /logo$/ }).closest("a")).toHaveAttribute(
        "href",
        "/",
      );

      // Every top-level destination is a link in its own right — none is reachable only by
      // opening a menu.
      for (const [label, href] of [
        ["Effects", "/effects"],
        ["Replications", "/replications"],
        ["Substances", "/substances"],
        ["Trip Reports", "/reports"],
        ["Project", "/about"],
      ]) {
        expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
      }
      for (const label of ["Effects", "Replications", "Project"]) {
        const chevron = chevronFor(label);
        expect(chevron).toHaveAttribute("aria-haspopup", "true");
        expect(chevron).toHaveAttribute("aria-expanded", "false");
        // The state lives on the chevron, never on the link.
        expect(screen.getByRole("link", { name: label })).not.toHaveAttribute("aria-expanded");
      }
      // Trip Reports and Substances have nothing to disclose — see below.
      expect(screen.queryAllByRole("menu")).toHaveLength(0);
      expect(
        screen.queryByRole("button", { name: "Show Substances submenu" }),
      ).not.toBeInTheDocument();
    });

    it("gives a submenu that only repeats its parent no chevron at all", () => {
      renderEffectIndex();

      // Trip Reports' single child points at /reports, exactly where the label already goes,
      // so there is nothing to disclose. The flavor still declares that child.
      expect(EFFECT_INDEX.navMenus.reports?.children).toEqual([
        { label: "Trip Reports", href: "/reports" },
      ]);
      expect(screen.getByRole("link", { name: "Trip Reports" })).toHaveAttribute("href", "/reports");
      expect(
        screen.queryByRole("button", { name: "Show Trip Reports submenu" }),
      ).not.toBeInTheDocument();
    });

    it("navigates from the label without opening the panel", async () => {
      const user = userEvent.setup();
      renderEffectIndex();
      const label = screen.getByRole("link", { name: "Effects" });

      await clickWithoutNavigating(user, label);

      // This is the complaint that prompted the split: the label is a destination, not a
      // disclosure control.
      expect(label).toHaveAttribute("href", "/effects");
      expect(screen.queryAllByRole("menu")).toHaveLength(0);
      expect(chevronFor("Effects")).toHaveAttribute("aria-expanded", "false");
    });

    it("opens the panel from the chevron without navigating", async () => {
      const user = userEvent.setup();
      renderEffectIndex();
      const chevron = chevronFor("Effects");

      // A button, so there is no href for a click to follow.
      expect(chevron.tagName).toBe("BUTTON");
      expect(chevron).not.toHaveAttribute("href");

      await user.click(chevron);

      expect(chevron).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    it("opens a dropdown on click and closes it on a second click", async () => {
      const user = userEvent.setup();
      renderEffectIndex();
      const chevron = chevronFor("Effects");

      await user.click(chevron);

      expect(chevron).toHaveAttribute("aria-expanded", "true");
      const menu = screen.getByRole("menu");
      expect(chevron).toHaveAttribute("aria-controls", menu.id);
      // Named after the section rather than after the chevron's action.
      expect(menu).toHaveAccessibleName("Effects");
      expect(
        within(menu)
          .getAllByRole("menuitem")
          .map((item) => [item.textContent, item.getAttribute("href")]),
      ).toEqual([
        ["Index", "/effects"],
        ["Sensory", "/effects/group/sensory"],
        ["Cognitive", "/effects/group/cognitive"],
        ["Physical", "/effects/group/physical"],
      ]);

      await user.click(chevron);

      expect(chevron).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryAllByRole("menu")).toHaveLength(0);
    });

    it("opens only one dropdown at a time", async () => {
      const user = userEvent.setup();
      renderEffectIndex();

      await user.click(chevronFor("Effects"));
      await user.click(chevronFor("Project"));

      expect(chevronFor("Effects")).toHaveAttribute("aria-expanded", "false");
      expect(chevronFor("Project")).toHaveAttribute("aria-expanded", "true");
    });

    it("opens external children in a new tab and says so", async () => {
      const user = userEvent.setup();
      renderEffectIndex();

      await user.click(chevronFor("Project"));
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
      const chevron = chevronFor("Replications");

      chevron.focus();
      await user.keyboard("{ArrowDown}");

      expect(chevron).toHaveAttribute("aria-expanded", "true");
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
      expect(chevron).toHaveAttribute("aria-expanded", "false");
      // Focus returns to the control that owns the panel, not to the label beside it.
      expect(chevron).toHaveFocus();
    });

    it("reaches both the destination and the submenu by keyboard alone", async () => {
      const user = userEvent.setup();
      renderEffectIndex();
      const label = screen.getByRole("link", { name: "Effects" });

      label.focus();
      // Tab order runs label then chevron, so neither control is keyboard-only reachable
      // through the other.
      await user.tab();
      expect(chevronFor("Effects")).toHaveFocus();

      // And the arrows still open the panel straight from the label, as the single combined
      // control used to.
      label.focus();
      await user.keyboard("{ArrowDown}");
      expect(chevronFor("Effects")).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("menuitem", { name: "Index" })).toHaveFocus();
    });

    it("closes on Escape from the label without stealing the reader's place", async () => {
      const user = userEvent.setup();
      renderEffectIndex();
      const label = screen.getByRole("link", { name: "Effects" });

      await user.click(chevronFor("Effects"));
      label.focus();
      await user.keyboard("{Escape}");

      expect(chevronFor("Effects")).toHaveAttribute("aria-expanded", "false");
      expect(label).toHaveFocus();
    });

    it("opens upwards from the chevron with ArrowUp", async () => {
      const user = userEvent.setup();
      renderEffectIndex();

      chevronFor("Effects").focus();
      await user.keyboard("{ArrowUp}");

      expect(screen.getByRole("menuitem", { name: "Physical" })).toHaveFocus();
    });

    it("closes when Tab leaves the chevron", async () => {
      const user = userEvent.setup();
      renderEffectIndex();
      const chevron = chevronFor("Effects");

      await user.click(chevron);
      chevron.focus();
      await user.tab();

      expect(chevron).toHaveAttribute("aria-expanded", "false");
    });

    it("closes when the reader clicks outside the nav", async () => {
      const user = userEvent.setup();
      renderEffectIndex();
      const chevron = chevronFor("Effects");

      await user.click(chevron);
      await user.click(document.body);

      expect(chevron).toHaveAttribute("aria-expanded", "false");
    });

    it("closes when a child is chosen", async () => {
      const user = userEvent.setup();
      renderEffectIndex();
      const chevron = chevronFor("Effects");

      await user.click(chevron);
      await user.click(screen.getByRole("menuitem", { name: "Sensory" }));

      expect(chevron).toHaveAttribute("aria-expanded", "false");
    });


    it("marks the section the reader is in on the link that goes there", () => {
      renderEffectIndex("/replications/audio");

      const label = screen.getByRole("link", { name: "Replications" });
      expect(label).toHaveAttribute("data-active", "true");
      expect(label).toHaveAttribute("aria-current", "page");
      // The chevron takes the active styling hook so the pair reads as one item, but it is not
      // the current page — it is a control.
      expect(chevronFor("Replications")).toHaveAttribute("data-active", "true");
      expect(chevronFor("Replications")).not.toHaveAttribute("aria-current");
      expect(screen.getByRole("link", { name: "Effects" })).not.toHaveAttribute("aria-current");
    });

    describe("mobile sheet", () => {
      const openSheet = async (user: ReturnType<typeof userEvent.setup>, pathname = "/") => {
        renderHeader(
          <Header
            model={getRouteChromeModel(pathname, null, EFFECT_INDEX)}
            onNavigate={vi.fn()}
            forceMobileNav
          />,
        );
        await user.click(screen.getByRole("button", { name: "Toggle navigation" }));

        // `forceMobileNav` only hides the desktop bar with a class, so queries have to be
        // scoped to the sheet or they match both copies of every label.
        return mobileSheet();
      };

      it("navigates from the label while the chevron expands the group", async () => {
        const user = userEvent.setup();
        const sheet = await openSheet(user);
        const chevron = chevronFor("Replications", sheet);
        const label = within(sheet).getByRole("link", { name: "Replications" });

        expect(label).toHaveAttribute("href", "/replications");
        expect(chevron).toHaveAttribute("aria-expanded", "false");
        // An accordion opens in place; nothing pops up over the sheet.
        expect(chevron).not.toHaveAttribute("aria-haspopup");
        expect(within(sheet).queryByRole("link", { name: "Audio" })).not.toBeInTheDocument();

        await user.click(chevron);

        expect(chevron).toHaveAttribute("aria-expanded", "true");
        const child = within(sheet).getByRole("link", { name: "Audio" });
        expect(child).toHaveAttribute("href", "/replications/audio");
        expect(
          document.getElementById(chevron.getAttribute("aria-controls") ?? ""),
        ).toContainElement(child);
        // Expanding must not have navigated away or closed the sheet.
        expect(within(sheet).getByRole("link", { name: "Replications" })).toBeInTheDocument();

        await user.click(chevron);
        expect(chevron).toHaveAttribute("aria-expanded", "false");

        // The label is a destination in its own right, and taking it closes the sheet.
        await clickWithoutNavigating(user, label);
        expect(document.getElementById("mobile-nav")).toBeNull();
      });

      it("gives the chevronless items no chevron here either", async () => {
        const user = userEvent.setup();
        const sheet = await openSheet(user);

        // Trip Reports' submenu is degenerate and Substances declares none at all; both
        // render as plain links in the sheet, exactly as they do in the desktop bar.
        for (const [label, href] of [
          ["Substances", "/substances"],
          ["Trip Reports", "/reports"],
        ]) {
          expect(within(sheet).getByRole("link", { name: label })).toHaveAttribute("href", href);
          expect(
            within(sheet).queryByRole("button", { name: `Show ${label} submenu` }),
          ).not.toBeInTheDocument();
        }
      });

      it("closes the sheet, and forgets what was expanded, once a child is chosen", async () => {
      const user = userEvent.setup();
      await openSheet(user);

      await user.click(chevronFor("Project", mobileSheet()));
      await user.click(within(mobileSheet()).getByRole("link", { name: "Articles" }));

      expect(document.getElementById("mobile-nav")).toBeNull();

      await user.click(screen.getByRole("button", { name: "Toggle navigation" }));

      // Reopening starts collapsed rather than restoring the previous expansion.
      expect(chevronFor("Project", mobileSheet())).toHaveAttribute("aria-expanded", "false");
      });
    });
  });
});
