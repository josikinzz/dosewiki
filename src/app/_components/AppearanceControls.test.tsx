import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACCENT_STORAGE_KEY,
  COLOR_SCHEME_STORAGE_KEY,
  ThemeProvider,
  VISUAL_STYLE_STORAGE_KEY,
} from "@/context/ThemeContext";
import { ACCENTS, BASE_ACCENT_ID } from "@/theme/accents";
import { SURFACES } from "@/theme/surfaces";
import { getPaletteLabOpen, setPaletteLabOpen } from "@/features/theme-lab/paletteLabStore";
import { AppearanceCog, type AppearanceCogRows } from "./AppearanceCog";
import { AppearanceControls } from "./AppearanceControls";
import { ThemeToggle } from "./ThemeToggle";
import { VisualStyleToggle } from "./VisualStyleToggle";

vi.mock("@/components/common/Icon", () => ({
  // Faithful to the real one (`src/components/common/Icon.tsx:36-44`): the glyph is
  // `aria-hidden` and contributes no text. That is what makes the name queries below
  // load-bearing — an icon-only control that lost its `aria-label` has no accessible name
  // at all here, exactly as in the browser, so it fails instead of matching its icon name.
  Icon: ({ icon }: { icon: string }) => (
    <span data-testid="icon" data-icon={icon} aria-hidden="true" />
  ),
}));

/** The default accent, and the first that is not — so a pick is observable as an attribute. */
const BASE_ACCENT = ACCENTS.find((accent) => accent.id === BASE_ACCENT_ID);
const OTHER_ACCENT = ACCENTS.find((accent) => accent.id !== BASE_ACCENT_ID);

if (!BASE_ACCENT || !OTHER_ACCENT) {
  throw new Error("The accent table must offer the default plus something else to pick.");
}

/** Every row on. The policy that decides these is asserted separately, below. */
const ALL_ROWS: AppearanceCogRows = {
  showVisualStyle: true,
  showColorScheme: true,
  showSurface: true,
  showAccent: true,
  showMoreSettings: true,
};

function renderCog(
  rows: Partial<AppearanceCogRows> = {},
  children?: ReactNode,
  provider: { isVisualStyleLocked?: boolean; isAccentLocked?: boolean } = {},
) {
  return render(
    <ThemeProvider
      initialColorScheme="dark"
      initialVisualStyle="fun"
      isVisualStyleLocked={false}
      {...provider}
    >
      <AppearanceCog {...ALL_ROWS} {...rows} />
      {children}
    </ThemeProvider>,
  );
}

async function openCog(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Appearance settings" }));

  return screen.findByRole("dialog", { name: "Appearance" });
}

describe("AppearanceCog", () => {
  // Pin the starting appearance in both places the provider can restore it from, so the
  // "Switch to day mode" / "Switch to Pro visual style" queries below mean the same thing
  // whichever publication flavor the suite runs under.
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, "dark");
    window.localStorage.setItem(VISUAL_STYLE_STORAGE_KEY, "fun");
    window.localStorage.setItem(ACCENT_STORAGE_KEY, BASE_ACCENT_ID);
    setPaletteLabOpen(false);
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.visualStyle = "fun";
    delete document.documentElement.dataset.accent;
  });

  it("presents one 44px cog and nothing else until it is opened", async () => {
    const user = userEvent.setup();
    renderCog();

    const cog = screen.getByRole("button", { name: "Appearance settings" });

    // jsdom does no layout, so the hit area is only observable as the sizing classes: h-11
    // and w-11 are the 44px minimum this control has to clear as the only appearance
    // affordance a reader ever sees.
    expect(cog.className).toMatch(/(?:^|\s)h-11(?:\s|$)/);
    expect(cog.className).toMatch(/(?:^|\s)w-11(?:\s|$)/);
    // The whole point of the cog: the surface carries one control, not a row of them.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const panel = await openCog(user);
    // Every axis is inside, in order: style, colour scheme, surfaces, accent.
    expect(
      within(panel)
        .getAllByRole("button")
        .map(
          (control) =>
            control.dataset.appearanceAxis ??
            control.dataset.surfaceSwatch ??
            control.dataset.accentSwatch,
        )
        .filter(Boolean),
    ).toEqual([
      "visual-style",
      "color-scheme",
      ...SURFACES.map((surface) => surface.id),
      ...ACCENTS.map((accent) => accent.id),
    ]);
  });

  it("visibly labels both palette rows while every swatch keeps its own name", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCog(user);
    expect(within(panel).getByText("Surfaces")).toBeVisible();
    expect(within(panel).getByText("Accent")).toBeVisible();
    expect(
      [...panel.querySelectorAll("button, a")].map((control) => control.getAttribute("aria-label")),
    ).toEqual([
      "Switch to Pro visual style",
      "Switch to day mode",
      ...SURFACES.map((option) => option.label),
      ...ACCENTS.map((option) => option.label),
      "Open full Palette Lab",
    ]);
    expect(
      within(panel).getByRole("button", { name: "Open full Palette Lab" }),
    ).toHaveAccessibleName("Open full Palette Lab");
  });

  it("holds no state of its own: every mounted control reflects one provider", async () => {
    const user = userEvent.setup();
    renderCog(
      {},
      // A second, independently mounted pair. Were the controls holding local state, these
      // would disagree with the cog's panel after the first click.
      <>
        <ThemeToggle />
        <VisualStyleToggle />
      </>,
    );

    const panel = await openCog(user);
    // Driven from inside the panel: clicking the loose pair instead would be an outside
    // click and dismiss the popover before the second half of the assertion.
    await user.click(within(panel).getByRole("button", { name: "Switch to day mode" }));

    await waitFor(() => {
      const dayNight = screen.getAllByRole("button", { name: "Switch to night mode" });
      expect(dayNight).toHaveLength(2);
      expect(dayNight.map((pill) => pill.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
    });

    await user.click(within(panel).getByRole("button", { name: "Switch to Pro visual style" }));

    await waitFor(() => {
      const funPro = screen.getAllByRole("button", { name: "Switch to Fun visual style" });
      expect(funPro).toHaveLength(2);
      expect(funPro.map((pill) => pill.dataset.appearanceValue)).toEqual(["pro", "pro"]);
    });
  });

  it("drives every document attribute, which is what makes /dev/kit a four-way harness", async () => {
    const user = userEvent.setup();
    renderCog();

    await openCog(user);
    await user.click(screen.getByRole("button", { name: "Switch to Pro visual style" }));
    await user.click(screen.getByRole("button", { name: "Switch to day mode" }));

    await waitFor(() => {
      expect(document.documentElement.dataset.visualStyle).toBe("pro");
      expect(document.documentElement.dataset.theme).toBe("light");
    });
  });

  it("operates from the keyboard alone: trigger, every row, close, back to the trigger", async () => {
    const user = userEvent.setup();
    renderCog();

    const cog = screen.getByRole("button", { name: "Appearance settings" });

    await user.tab();
    expect(cog).toHaveFocus();
    await user.keyboard("{Enter}");

    const panel = await screen.findByRole("dialog", { name: "Appearance" });
    // The panel is portalled, so tab order is no longer "the next sibling in the markup".
    // Visual order and focus order agree: binary controls, both swatch rows, then the
    // full-width Palette Lab action.
    const reachable = within(panel).getAllByRole("button");

    await waitFor(() => {
      expect(reachable[0]).toHaveFocus();
    });

    for (const control of reachable.slice(1)) {
      await user.tab();
      expect(control).toHaveFocus();
    }

    // Every axis is operable once reached, not merely focusable.
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(cog).toHaveFocus();

    await user.keyboard(" ");
    await user.tab();
    expect(screen.getByRole("button", { name: "Switch to day mode" })).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Switch to night mode" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
  });

  it("keeps Escape inside the panel, so it cannot also close the page around it", async () => {
    const user = userEvent.setup();
    const reactAncestorEscape = vi.fn();
    // The other kind of page-level handler: the /dev shell's "Escape leaves the editor" is a
    // window listener, and React's own root listener sits inside <body>, so stopping the key
    // in the panel has to keep it from arriving here too.
    const windowEscape = vi.fn();
    window.addEventListener("keydown", windowEscape);

    try {
      render(
        // React routes events from portalled content up the component tree, not the DOM
        // tree, so an ancestor handler would otherwise see the panel's Escape.
        //
        // This div is a probe, not UI: it exists to observe whether the key escapes the panel,
        // so the a11y rule about interactive non-native elements has nothing to bite on here.
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div onKeyDown={reactAncestorEscape}>
          <ThemeProvider
            initialColorScheme="dark"
            initialVisualStyle="fun"
            isVisualStyleLocked={false}
          >
            <AppearanceCog {...ALL_ROWS} />
          </ThemeProvider>
        </div>,
      );

      await openCog(user);
      reactAncestorEscape.mockClear();
      windowEscape.mockClear();
      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(reactAncestorEscape).not.toHaveBeenCalled();
      expect(windowEscape).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", windowEscape);
    }
  });

  it("applies an accent pick immediately, with no save step", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCog(user);
    const swatches = within(panel).getByRole("group", { name: "Accent" });

    // One swatch per entry in ACCENTS — the row states no count of its own.
    expect(
      within(swatches)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(ACCENTS.map((accent) => accent.label));

    const active = within(swatches).getByRole("button", { name: BASE_ACCENT.label });
    expect(active).toHaveAttribute("aria-pressed", "true");
    expect(active.dataset.active).toBe("true");

    await user.click(within(swatches).getByRole("button", { name: OTHER_ACCENT.label }));

    await waitFor(() => {
      // setAccent ran and the provider wrote the axis through: no confirm, no save.
      expect(document.documentElement.dataset.accent).toBe(OTHER_ACCENT.id);
    });
    expect(within(swatches).getByRole("button", { name: OTHER_ACCENT.label })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(active).toHaveAttribute("aria-pressed", "false");
    // The panel stays open, so the reader can compare accents without reopening it.
    expect(screen.getByRole("dialog", { name: "Appearance" })).toBeInTheDocument();
  });

  it("drops a locked row rather than rendering it inert", async () => {
    const user = userEvent.setup();
    renderCog({
      showVisualStyle: false,
      showSurface: false,
      showAccent: false,
      showMoreSettings: false,
    });

    const panel = await openCog(user);

    expect(within(panel).queryByRole("button", { name: /visual style/ })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("group", { name: "Accent" })).not.toBeInTheDocument();
    // No link at all, rather than no link with a particular name: the guarantee is that a
    // reader is never handed an editor route, and stating it this way cannot quietly stop
    // meaning anything if the link's name ever changes.
    expect(within(panel).queryByRole("link")).not.toBeInTheDocument();
    expect(
      within(panel)
        .getAllByRole("button")
        .map((control) => control.dataset.appearanceAxis),
    ).toEqual(["color-scheme"]);
  });

  it("renders no cog at all when a build offers a reader nothing", () => {
    renderCog({
      showVisualStyle: false,
      showColorScheme: false,
      showSurface: false,
      showAccent: false,
      showMoreSettings: false,
    });

    expect(screen.queryByRole("button", { name: "Appearance settings" })).not.toBeInTheDocument();
  });

  /**
   * The `/dev/kit` sweep server-renders every story in all four combinations, but a closed
   * Radix popover renders nothing on the server and its portal returns null before mount —
   * so the panel's four-way coverage has to live here, where it can actually be opened.
   */
  it.each([
    { colorScheme: "light", visualStyle: "fun" },
    { colorScheme: "dark", visualStyle: "fun" },
    { colorScheme: "light", visualStyle: "pro" },
    { colorScheme: "dark", visualStyle: "pro" },
  ] as const)(
    "opens a complete panel in $visualStyle $colorScheme",
    async ({ colorScheme, visualStyle }) => {
      const user = userEvent.setup();
      document.documentElement.dataset.theme = colorScheme;
      document.documentElement.dataset.visualStyle = visualStyle;
      window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, colorScheme);
      window.localStorage.setItem(VISUAL_STYLE_STORAGE_KEY, visualStyle);

      render(
        <ThemeProvider
          initialColorScheme={colorScheme}
          initialVisualStyle={visualStyle}
          isVisualStyleLocked={false}
        >
          <AppearanceCog {...ALL_ROWS} />
        </ThemeProvider>,
      );

      const panel = await openCog(user);
      const surfaceButtons = SURFACES.map((option) =>
        within(panel).getByRole("button", { name: option.label }),
      );

      expect(panel).toHaveClass("theme-overlay-surface");
      expect(panel.querySelectorAll("[data-appearance-axis]")).toHaveLength(2);
      expect(panel.querySelectorAll("[data-accent-swatch]")).toHaveLength(ACCENTS.length);
      expect(surfaceButtons.every((button) => button.hasAttribute("disabled"))).toBe(
        visualStyle === "pro",
      );
      for (const [index, button] of surfaceButtons.entries()) {
        expect(button.firstElementChild).toHaveStyle({
          backgroundColor: SURFACES[index]!.tint[colorScheme],
        });
      }
      expect(
        within(panel).getByRole("button", { name: "Open full Palette Lab" }),
      ).toHaveAttribute("aria-controls", "palette-lab-panel");
    },
  );
});

describe("AppearanceControls", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.visualStyle = "fun";
  });

  it("omits the style row when the provider says the axis is not writable", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider initialColorScheme="light" initialVisualStyle="pro" isVisualStyleLocked>
        <AppearanceControls />
      </ThemeProvider>,
    );

    const panel = await openCog(user);

    // The lock is read from the provider, the only thing that knows whether setVisualStyle
    // does anything, rather than re-derived from the flavor config.
    expect(within(panel).queryByRole("button", { name: /visual style/ })).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /day mode|night mode/ })).toBeInTheDocument();
  });

  it("omits the accent row when the publication locks the accent axis", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider initialColorScheme="dark" initialVisualStyle="pro" isAccentLocked>
        <AppearanceControls />
      </ThemeProvider>,
    );

    const panel = await openCog(user);

    expect(within(panel).queryByRole("group", { name: "Accent" })).not.toBeInTheDocument();
  });

  it("opens the public Palette Lab drawer from a reader's cog", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider initialColorScheme="dark" initialVisualStyle="fun" isVisualStyleLocked={false}>
        <AppearanceControls />
      </ThemeProvider>,
    );

    const panel = await openCog(user);
    await user.click(within(panel).getByRole("button", { name: "Open full Palette Lab" }));

    expect(getPaletteLabOpen()).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Appearance" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Appearance settings" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("puts the caller's class on the trigger itself, with no wrapper to take the offset", () => {
    render(
      <ThemeProvider initialColorScheme="dark" initialVisualStyle="fun" isVisualStyleLocked={false}>
        <AppearanceControls className="theme-home-theme-toggle fixed bottom-4 right-4" />
      </ThemeProvider>,
    );

    expect(screen.getByRole("button", { name: "Appearance settings" }).className).toMatch(
      /theme-home-theme-toggle/,
    );
  });
});
