import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACCENT_HUE_STORAGE_KEY,
  COLOR_SCHEME_STORAGE_KEY,
  SURFACE_HUE_STORAGE_KEY,
  ThemeProvider,
  VISUAL_STYLE_STORAGE_KEY,
} from "@/context/ThemeContext";
import { writeEditorHint } from "@/lib/auth/editorHint";
import {
  ACCENT_HUE_PROPERTY,
  DEFAULT_APPEARANCE_COLORS,
} from "@/theme/appearanceChroma";
import { getThemeLabOpen, setThemeLabOpen } from "@/features/theme-lab/themeLabStore";
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

/** The four sliders' accessible names, in visual and focus order. */
const SLIDER_NAMES = [
  "Surface hue",
  "Surface saturation",
  "Accent hue",
  "Accent saturation",
] as const;

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
    setThemeLabOpen(false);
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.visualStyle = "fun";
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
    // The two binary axes, in order — and no swatches anywhere: the colour axes are
    // sliders now, asserted below in the same visual order.
    expect(
      within(panel)
        .getAllByRole("button")
        .map((control) => control.dataset.appearanceAxis)
        .filter(Boolean),
    ).toEqual(["visual-style", "color-scheme"]);
    expect(
      within(panel)
        .getAllByRole("slider")
        .map((slider) => slider.getAttribute("aria-label")),
    ).toEqual([...SLIDER_NAMES]);
  });

  it("visibly labels both colour axes while every slider keeps its own name", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCog(user);
    expect(within(panel).getByText("Surface")).toBeVisible();
    expect(within(panel).getByText("Accent")).toBeVisible();
    expect(
      [...panel.querySelectorAll("button, a")].map((control) => control.getAttribute("aria-label")),
    ).toEqual([
      "Switch to Pro visual style",
      "Switch to day mode",
      // The colour reset and the compact Theme Lab entry sit at the end of the
      // binary-control row, ahead of the slider pairs.
      "Reset colors to default",
      "Open Theme Lab",
    ]);
    expect(
      [...panel.querySelectorAll("input")].map((control) => control.getAttribute("aria-label")),
    ).toEqual([...SLIDER_NAMES]);
    expect(
      within(panel).getByRole("button", { name: "Open Theme Lab" }),
    ).toHaveAccessibleName("Open Theme Lab");
  });

  it("starts a touch drag on first contact anywhere along a slider", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCog(user);
    const slider = within(panel).getByRole<HTMLInputElement>("slider", {
      name: "Surface hue",
    });
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 0,
      left: 100,
      top: 0,
      right: 300,
      bottom: 44,
      width: 200,
      height: 44,
      toJSON: () => ({}),
    });
    const setPointerCapture = vi.fn();
    Object.defineProperty(slider, "setPointerCapture", {
      configurable: true,
      value: setPointerCapture,
    });

    // No priming tap: the initial quarter-track contact updates immediately.
    fireEvent.pointerDown(slider, {
      clientX: 150,
      pointerId: 7,
      pointerType: "touch",
    });
    await waitFor(() => expect(slider.value).toBe("90"));
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(slider).toHaveFocus();

    // Pointer capture keeps the same first gesture live as the finger moves.
    fireEvent.pointerMove(slider, {
      clientX: 250,
      pointerId: 7,
      pointerType: "touch",
    });
    await waitFor(() => expect(slider.value).toBe("269"));
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
    // Visual order and focus order agree: the two binary toggles, the colour
    // reset, the compact Theme Lab entry, then each colour axis's hue slider
    // followed by its saturation slider.
    const reachable = within(panel).getAllByRole("button");
    const sliders = within(panel).getAllByRole("slider");
    expect(reachable.map((control) => control.getAttribute("aria-label"))).toEqual([
      "Switch to Pro visual style",
      "Switch to day mode",
      "Reset colors to default",
      "Open Theme Lab",
    ]);
    expect(sliders.map((slider) => slider.getAttribute("aria-label"))).toEqual([
      ...SLIDER_NAMES,
    ]);

    await waitFor(() => {
      expect(reachable[0]).toHaveFocus();
    });

    const order = [...reachable.slice(1), ...sliders];
    for (const control of order) {
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

  it("applies a hue drag immediately, with no save step", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCog(user);
    const accentHue = within(panel).getByRole<HTMLInputElement>("slider", {
      name: "Accent hue",
    });

    fireEvent.change(accentHue, { target: { value: "249" } });

    await waitFor(() => {
      // The setter ran with the integer and the provider wrote the axis through — the
      // custom property painted on the next animation frame, the degrees string
      // persisted once the drag rested: no confirm, no save step.
      expect(document.documentElement.style.getPropertyValue(ACCENT_HUE_PROPERTY)).toBe("249");
      expect(window.localStorage.getItem(ACCENT_HUE_STORAGE_KEY)).toBe("249");
    });
    expect(accentHue.value).toBe("249");
    // The untouched axis did not move with it.
    expect(window.localStorage.getItem(SURFACE_HUE_STORAGE_KEY)).toBeNull();
    // The panel stays open, so the reader can compare rotations without reopening it.
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
    expect(within(panel).queryByRole("group", { name: "Surface" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("group", { name: "Accent" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("slider")).not.toBeInTheDocument();
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

  it("opens with all four sliders live and parked on the site defaults", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCog(user);

    // Every slider is live — saturation 0 is a coordinate, not a disabled
    // state — and a fresh reader parks on the default Fun-dark matrix entry.
    const defaults = DEFAULT_APPEARANCE_COLORS.fun.dark;
    const values: Record<(typeof SLIDER_NAMES)[number], string> = {
      "Surface hue": String(defaults.surfaceHue),
      "Surface saturation": String(Math.round(defaults.surfaceLevel * 100)),
      "Accent hue": String(defaults.accentHue),
      "Accent saturation": String(Math.round(defaults.accentLevel * 100)),
    };
    for (const name of SLIDER_NAMES) {
      const slider = within(panel).getByRole<HTMLInputElement>("slider", { name });
      expect(slider).toBeEnabled();
      expect(slider.value).toBe(values[name]);
    }

    // Saturation 0 is a position on the axis, not a special mode: the sliders stay live.
    fireEvent.change(
      within(panel).getByRole<HTMLInputElement>("slider", { name: "Surface saturation" }),
      { target: { value: "0" } },
    );
    await waitFor(() => {
      expect(
        within(panel).getByRole<HTMLInputElement>("slider", { name: "Surface saturation" })
          .value,
      ).toBe("0");
    });
    expect(within(panel).getByRole("slider", { name: "Surface hue" })).toBeEnabled();
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

      expect(panel).toHaveClass("theme-overlay-surface");
      expect(panel.querySelectorAll("[data-appearance-axis]")).toHaveLength(2);
      // Both colour axes work on both visual styles: the accent pair rotates
      // and re-saturates the Pro --ei-* ramp, and the surface pair drives the
      // additive Pro surface blocks (c + K × level over the authored
      // charcoal), so no slider is disabled anywhere in the matrix and the
      // old "Fun only" lock is gone.
      for (const name of SLIDER_NAMES) {
        expect(within(panel).getByRole("slider", { name }), name).toBeEnabled();
      }
      expect(within(panel).queryByText("Fun only")).not.toBeInTheDocument();
      // With nothing saved, all four thumbs park on this exact
      // visual-style and colour-scheme combination's defaults.
      const expected = DEFAULT_APPEARANCE_COLORS[visualStyle][colorScheme];
      expect(
        within(panel).getByRole<HTMLInputElement>("slider", { name: "Surface hue" }).value,
      ).toBe(String(expected.surfaceHue));
      expect(
        within(panel).getByRole<HTMLInputElement>("slider", { name: "Surface saturation" }).value,
      ).toBe(String(Math.round(expected.surfaceLevel * 100)));
      expect(
        within(panel).getByRole<HTMLInputElement>("slider", { name: "Accent hue" }).value,
      ).toBe(String(expected.accentHue));
      expect(
        within(panel).getByRole<HTMLInputElement>("slider", { name: "Accent saturation" }).value,
      ).toBe(String(Math.round(expected.accentLevel * 100)));
      expect(
        within(panel).getByRole("button", { name: "Open Theme Lab" }),
      ).toHaveAttribute("aria-controls", "theme-lab-panel");
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

  it("omits the accent sliders when the publication locks the accent axis", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider initialColorScheme="dark" initialVisualStyle="pro" isAccentLocked>
        <AppearanceControls />
      </ThemeProvider>,
    );

    const panel = await openCog(user);

    expect(within(panel).queryByRole("group", { name: "Accent" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("slider", { name: "Accent hue" })).not.toBeInTheDocument();
  });

  it("opens the Theme Lab drawer from a dev's cog", async () => {
    // The entry is dev-gated: this browser carries the editor hint.
    writeEditorHint();
    const user = userEvent.setup();
    render(
      <ThemeProvider initialColorScheme="dark" initialVisualStyle="fun" isVisualStyleLocked={false}>
        <AppearanceControls />
      </ThemeProvider>,
    );

    const panel = await openCog(user);
    await user.click(within(panel).getByRole("button", { name: "Open Theme Lab" }));

    expect(getThemeLabOpen()).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Appearance" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Appearance settings" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("withholds the Theme Lab when the caller vetoes it, keeping every axis", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider initialColorScheme="dark" initialVisualStyle="fun" isVisualStyleLocked={false}>
        <AppearanceControls allowThemeLab={false} />
      </ThemeProvider>,
    );

    const panel = await openCog(user);

    // The pre-launch holding page's cog: a visitor still picks an appearance, but the Lab
    // authors and shares palettes over routes the construction hosts do not serve.
    expect(within(panel).queryByRole("button", { name: "Open Theme Lab" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /day mode|night mode/ })).toBeInTheDocument();
    expect(within(panel).getByRole("group", { name: "Accent" })).toBeInTheDocument();
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
