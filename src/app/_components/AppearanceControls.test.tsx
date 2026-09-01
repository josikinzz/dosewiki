import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
import {
  getThemeLabOpen,
  setThemeLabOpen,
} from "@/features/theme-lab/themeLabStore";
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
  "Background hue",
  "Background saturation",
  "Accent hue",
  "Accent saturation",
] as const;

/** Every row on. The policy that decides these is asserted separately, below. */
const ALL_ROWS: AppearanceCogRows = {
  showVisualStyle: true,
  showColorScheme: true,
  showSurface: true,
  showAccent: true,
  showFont: true,
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

  return screen.findByRole("dialog", { name: "Appearance settings" });
}

/** Expand one colour axis's summary row to reveal its Hue/Saturation sliders. */
async function expandColorAxis(
  user: UserEvent,
  panel: HTMLElement,
  axis: "Background" | "Accent",
) {
  await user.click(
    within(panel).getByRole("button", { name: `${axis} colors` }),
  );
}

describe("AppearanceCog", () => {
  // Pin the starting appearance in both places the provider can restore it from, so the
  // checked Fun and Dark radio options mean the same thing under every publication flavor.
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, "dark");
    window.localStorage.setItem(VISUAL_STYLE_STORAGE_KEY, "fun");
    setThemeLabOpen(false);
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.visualStyle = "fun";
    delete document.documentElement.dataset.font;
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
    // The three axes, in order. The colour axes are collapsed behind summary rows
    // at first — no slider is in the DOM until a group is expanded; their names are
    // asserted once expanded by the four-way matrix below.
    expect(
      [...panel.querySelectorAll("[data-appearance-axis]")].map((control) =>
        control.getAttribute("data-appearance-axis"),
      ),
    ).toEqual(["color-scheme", "visual-style", "font"]);
    expect(within(panel).queryAllByRole("slider")).toHaveLength(0);
    expect(
      within(panel).getByRole("button", { name: "Background colors" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      within(panel).getByRole("button", { name: "Accent colors" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("visibly labels every appearance axis and states the color-reset scope", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCog(user);
    expect(within(panel).queryByRole("heading")).not.toBeInTheDocument();
    expect(
      within(panel).getByRole("radiogroup", { name: "Style" }),
    ).toBeVisible();
    expect(
      within(panel).getByRole("radiogroup", { name: "Mode" }),
    ).toBeVisible();
    expect(
      within(panel).getByRole("radiogroup", { name: "Font" }),
    ).toBeVisible();
    // The colour axes present as collapsed summary rows until expanded.
    expect(
      within(panel).getByRole("button", { name: "Background colors" }),
    ).toBeVisible();
    expect(
      within(panel).getByRole("button", { name: "Accent colors" }),
    ).toBeVisible();

    const style = within(panel).getByRole("radiogroup", {
      name: "Style",
    });
    expect(within(style).getByRole("radio", { name: "Vivid" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(style).getByRole("radio", { name: "Clinical" })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    const mode = within(panel).getByRole("radiogroup", { name: "Mode" });
    expect(within(mode).getByRole("radio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(mode).getByRole("radio", { name: "Light" })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    const font = within(panel).getByRole("radiogroup", { name: "Font" });
    expect(
      within(font).getByRole("radio", { name: "Standard" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      within(font).getByRole("radio", { name: "Dyslexic" }),
    ).toHaveAttribute("aria-checked", "false");

    expect(within(font).getByText("Standard")).toHaveClass(
      "theme-font-preview-standard",
    );
    expect(within(font).getByText("Dyslexic")).toHaveClass(
      "theme-font-preview-dyslexic",
    );

    // Reset earns its row only once a colour axis carries a saved coordinate.
    expect(
      within(panel).queryByRole("button", { name: "Reset colors" }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: "Open Theme Lab" }),
    ).toHaveAccessibleName("Open Theme Lab");
  });

  it("collapses the colour axes and reveals each slider pair in place", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCog(user);
    // Collapsed: no slider rows, and the sliders' Hue/Saturation labels are gone too.
    expect(within(panel).queryAllByRole("slider")).toHaveLength(0);
    expect(within(panel).queryAllByText("Hue")).toHaveLength(0);
    expect(within(panel).queryAllByText("Saturation")).toHaveLength(0);

    await expandColorAxis(user, panel, "Background");
    expect(
      within(panel).getByRole("group", { name: "Background" }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("slider", { name: "Background hue" }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("slider", { name: "Background saturation" }),
    ).toBeInTheDocument();

    await expandColorAxis(user, panel, "Accent");
    expect(within(panel).getAllByText("Hue")).toHaveLength(2);
    expect(within(panel).getAllByText("Saturation")).toHaveLength(2);
    expect(within(panel).getAllByRole("slider")).toHaveLength(4);

    // The named swatch rows carry the axes' meaning; no explanatory caption restates them.
    expect(
      within(panel).queryByText(/is the page color/),
    ).not.toBeInTheDocument();
  });

  it("offers Reset only while a colour axis carries a saved coordinate", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCog(user);
    expect(
      within(panel).queryByRole("button", { name: "Reset colors" }),
    ).not.toBeInTheDocument();

    await expandColorAxis(user, panel, "Accent");
    fireEvent.change(within(panel).getByRole("slider", { name: "Accent hue" }), {
      target: { value: "120" },
    });

    await waitFor(() => {
      expect(
        within(panel).getByRole("button", { name: "Reset colors" }),
      ).toBeVisible();
    });

    // Resetting removes the saved coordinate, so the action retires with it.
    await user.click(within(panel).getByRole("button", { name: "Reset colors" }));
    await waitFor(() => {
      expect(
        within(panel).queryByRole("button", { name: "Reset colors" }),
      ).not.toBeInTheDocument();
    });
  });

  it("selects the named font option and follows arrow-key radio behavior", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCog(user);
    const font = within(panel).getByRole("radiogroup", { name: "Font" });
    const standard = within(font).getByRole("radio", { name: "Standard" });
    const dyslexic = within(font).getByRole("radio", {
      name: "Dyslexic",
    });

    await user.click(dyslexic);
    await waitFor(() => {
      expect(document.documentElement.dataset.font).toBe("dyslexic");
      expect(dyslexic).toHaveAttribute("aria-checked", "true");
      expect(standard).toHaveAttribute("aria-checked", "false");
    });

    await user.keyboard("{ArrowLeft}");
    await waitFor(() => {
      expect(document.documentElement).not.toHaveAttribute("data-font");
      expect(standard).toHaveAttribute("aria-checked", "true");
      expect(standard).toHaveFocus();
    });
  });

  it("flips the binary axes from their checked half and selects Mode segments directly", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCog(user);
    const style = within(panel).getByRole("radiogroup", {
      name: "Style",
    });
    const mode = within(panel).getByRole("radiogroup", { name: "Mode" });
    const font = within(panel).getByRole("radiogroup", { name: "Font" });

    await user.click(within(style).getByRole("radio", { name: "Vivid" }));
    await waitFor(() => {
      expect(document.documentElement.dataset.visualStyle).toBe("pro");
    });

    // Mode is a three-way pick, not a toggle: the checked segment is a no-op…
    await user.click(within(mode).getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");

    // …and an unchecked one selects exactly itself.
    await user.click(within(mode).getByRole("radio", { name: "Light" }));
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe("light");
    });

    await user.click(within(font).getByRole("radio", { name: "Standard" }));
    await waitFor(() => {
      expect(document.documentElement.dataset.font).toBe("dyslexic");
    });
  });

  it("stores the System preference and follows the OS scheme live", async () => {
    const user = userEvent.setup();
    let matches = false;
    const listeners = new Set<(event: { matches: boolean }) => void>();
    const query = {
      get matches() {
        return matches;
      },
      media: "(prefers-color-scheme: light)",
      addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) => {
        listeners.delete(listener);
      },
    };
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(query));

    try {
      renderCog();
      const panel = await openCog(user);
      const mode = within(panel).getByRole("radiogroup", { name: "Mode" });

      // Selecting System stores the preference while painting the current OS
      // scheme (the stub says dark).
      await user.click(within(mode).getByRole("radio", { name: "System" }));
      await waitFor(() => {
        expect(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe("system");
        expect(document.documentElement.dataset.theme).toBe("dark");
        expect(
          within(mode).getByRole("radio", { name: "System" }),
        ).toHaveAttribute("aria-checked", "true");
      });

      // An OS day/night flip restyles the page live: the painted scheme moves,
      // the stored preference stays "system".
      matches = true;
      act(() => {
        for (const listener of listeners) listener({ matches });
      });
      await waitFor(() => {
        expect(document.documentElement.dataset.theme).toBe("light");
        expect(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe("system");
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("starts a touch drag on first contact anywhere along a slider", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCog(user);
    await expandColorAxis(user, panel, "Background");
    const slider = within(panel).getByRole<HTMLInputElement>("slider", {
      name: "Background hue",
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
      // would disagree with the cog's panel after the first selection.
      <>
        <ThemeToggle />
        <VisualStyleToggle />
      </>,
    );

    const panel = await openCog(user);
    // Driven from inside the panel: selecting the loose pair instead would be an outside
    // click and dismiss the popover before the second half of the assertion.
    await user.click(within(panel).getByRole("radio", { name: "Light" }));

    await waitFor(() => {
      const lightOptions = screen.getAllByRole("radio", { name: "Light" });
      expect(lightOptions).toHaveLength(2);
      expect(
        lightOptions.map((option) => option.getAttribute("aria-checked")),
      ).toEqual(["true", "true"]);
    });

    await user.click(within(panel).getByRole("radio", { name: "Clinical" }));

    await waitFor(() => {
      const styleGroups = screen.getAllByRole("radiogroup", {
        name: "Style",
      });
      expect(styleGroups).toHaveLength(2);
      expect(
        styleGroups.map((group) => group.getAttribute("data-appearance-value")),
      ).toEqual(["pro", "pro"]);
    });
  });

  it("drives every document attribute, which is what makes /dev/kit a four-way harness", async () => {
    const user = userEvent.setup();
    renderCog();

    await openCog(user);
    await user.click(screen.getByRole("radio", { name: "Clinical" }));
    await user.click(screen.getByRole("radio", { name: "Light" }));

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

    const panel = await screen.findByRole("dialog", {
      name: "Appearance settings",
    });
    // Each segmented choice is one tab stop, entered on its checked radio. The two
    // collapsed colour summaries follow, then the dev-only Theme Lab action — no Reset,
    // because this reader has tuned nothing.
    const focusSequence = [
      within(panel).getByRole("radio", { name: "Dark" }),
      within(panel).getByRole("radio", { name: "Vivid" }),
      within(panel).getByRole("radio", { name: "Standard" }),
      within(panel).getByRole("button", { name: "Background colors" }),
      within(panel).getByRole("button", { name: "Accent colors" }),
      within(panel).getByRole("button", { name: "Open Theme Lab" }),
    ];

    await waitFor(() => {
      expect(focusSequence[0]).toHaveFocus();
    });

    for (const control of focusSequence.slice(1)) {
      await user.tab();
      expect(control).toHaveFocus();
    }

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(cog).toHaveFocus();

    await user.keyboard(" ");
    // Reopening seats focus on the first row's checked radio, so one tab reaches the
    // style row; arrowing there selects the other face.
    await user.tab();
    expect(screen.getByRole("radio", { name: "Vivid" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Clinical" })).toHaveAttribute(
        "aria-checked",
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
    await expandColorAxis(user, panel, "Accent");
    const accentHue = within(panel).getByRole<HTMLInputElement>("slider", {
      name: "Accent hue",
    });

    fireEvent.change(accentHue, { target: { value: "249" } });

    await waitFor(() => {
      // The setter ran with the integer and the provider wrote the axis through — the
      // custom property painted on the next animation frame, the degrees string
      // persisted once the drag rested: no confirm, no save step.
      expect(
        document.documentElement.style.getPropertyValue(ACCENT_HUE_PROPERTY),
      ).toBe("249");
      expect(window.localStorage.getItem(ACCENT_HUE_STORAGE_KEY)).toBe("249");
    });
    expect(accentHue.value).toBe("249");
    // The untouched axis did not move with it.
    expect(window.localStorage.getItem(SURFACE_HUE_STORAGE_KEY)).toBeNull();
    // The panel stays open, so the reader can compare rotations without reopening it.
    expect(
      screen.getByRole("dialog", { name: "Appearance settings" }),
    ).toBeInTheDocument();
  });

  it("resets only Surface and Accent while preserving the other appearance choices", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCog(user);
    await expandColorAxis(user, panel, "Accent");
    const accentHue = within(panel).getByRole<HTMLInputElement>("slider", {
      name: "Accent hue",
    });
    fireEvent.change(accentHue, { target: { value: "249" } });
    await user.click(within(panel).getByRole("radio", { name: "Clinical" }));
    await user.click(within(panel).getByRole("radio", { name: "Light" }));
    await user.click(
      within(panel).getByRole("radio", { name: "Dyslexic" }),
    );
    await user.click(
      within(panel).getByRole("button", { name: "Reset colors" }),
    );

    await waitFor(() => {
      expect(window.localStorage.getItem(ACCENT_HUE_STORAGE_KEY)).toBeNull();
      expect(accentHue.value).toBe(
        String(DEFAULT_APPEARANCE_COLORS.pro.light.accentHue),
      );
      expect(document.documentElement.dataset.visualStyle).toBe("pro");
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(document.documentElement.dataset.font).toBe("dyslexic");
    });
  });

  it("drops a locked row rather than rendering it inert", async () => {
    const user = userEvent.setup();
    renderCog({
      showVisualStyle: false,
      showSurface: false,
      showAccent: false,
      showFont: false,
      showMoreSettings: false,
    });

    const panel = await openCog(user);

    expect(
      within(panel).queryByRole("radiogroup", { name: "Style" }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole("button", { name: "Background colors" }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole("button", { name: "Accent colors" }),
    ).not.toBeInTheDocument();
    expect(within(panel).queryByRole("slider")).not.toBeInTheDocument();
    // No link at all, rather than no link with a particular name: the guarantee is that a
    // reader is never handed an editor route, and stating it this way cannot quietly stop
    // meaning anything if the link's name ever changes.
    expect(within(panel).queryByRole("link")).not.toBeInTheDocument();
    expect(
      [...panel.querySelectorAll("[data-appearance-axis]")].map((control) =>
        control.getAttribute("data-appearance-axis"),
      ),
    ).toEqual(["color-scheme"]);
  });

  it("renders no cog at all when a build offers a reader nothing", () => {
    renderCog({
      showVisualStyle: false,
      showColorScheme: false,
      showSurface: false,
      showAccent: false,
      showFont: false,
      showMoreSettings: false,
    });

    expect(
      screen.queryByRole("button", { name: "Appearance settings" }),
    ).not.toBeInTheDocument();
  });

  it("opens with all four sliders live and parked on the site defaults", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCog(user);
    await expandColorAxis(user, panel, "Background");
    await expandColorAxis(user, panel, "Accent");

    // Every slider is live — saturation 0 is a coordinate, not a disabled
    // state — and a fresh reader parks on the default Fun-dark matrix entry.
    const defaults = DEFAULT_APPEARANCE_COLORS.fun.dark;
    const values: Record<(typeof SLIDER_NAMES)[number], string> = {
      "Background hue": String(defaults.surfaceHue),
      "Background saturation": String(Math.round(defaults.surfaceLevel * 100)),
      "Accent hue": String(defaults.accentHue),
      "Accent saturation": String(Math.round(defaults.accentLevel * 100)),
    };
    for (const name of SLIDER_NAMES) {
      const slider = within(panel).getByRole<HTMLInputElement>("slider", {
        name,
      });
      expect(slider).toBeEnabled();
      expect(slider.value).toBe(values[name]);
    }

    // Saturation 0 is a position on the axis, not a special mode: the sliders stay live.
    fireEvent.change(
      within(panel).getByRole<HTMLInputElement>("slider", {
        name: "Background saturation",
      }),
      { target: { value: "0" } },
    );
    await waitFor(() => {
      expect(
        within(panel).getByRole<HTMLInputElement>("slider", {
          name: "Background saturation",
        }).value,
      ).toBe("0");
    });
    expect(
      within(panel).getByRole("slider", { name: "Background hue" }),
    ).toBeEnabled();
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
      await expandColorAxis(user, panel, "Background");
      await expandColorAxis(user, panel, "Accent");

      expect(panel).toHaveClass("theme-overlay-surface");
      expect(panel.querySelectorAll("[data-appearance-axis]")).toHaveLength(3);
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
        within(panel).getByRole<HTMLInputElement>("slider", {
          name: "Background hue",
        }).value,
      ).toBe(String(expected.surfaceHue));
      expect(
        within(panel).getByRole<HTMLInputElement>("slider", {
          name: "Background saturation",
        }).value,
      ).toBe(String(Math.round(expected.surfaceLevel * 100)));
      expect(
        within(panel).getByRole<HTMLInputElement>("slider", {
          name: "Accent hue",
        }).value,
      ).toBe(String(expected.accentHue));
      expect(
        within(panel).getByRole<HTMLInputElement>("slider", {
          name: "Accent saturation",
        }).value,
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
      <ThemeProvider
        initialColorScheme="light"
        initialVisualStyle="pro"
        isVisualStyleLocked
      >
        <AppearanceControls />
      </ThemeProvider>,
    );

    const panel = await openCog(user);

    // The lock is read from the provider, the only thing that knows whether setVisualStyle
    // does anything, rather than re-derived from the flavor config.
    expect(
      within(panel).queryByRole("radiogroup", { name: "Style" }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).getByRole("radiogroup", { name: "Mode" }),
    ).toBeInTheDocument();
  });

  it("omits the accent sliders when the publication locks the accent axis", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider
        initialColorScheme="dark"
        initialVisualStyle="pro"
        isAccentLocked
      >
        <AppearanceControls />
      </ThemeProvider>,
    );

    const panel = await openCog(user);

    expect(
      within(panel).queryByRole("button", { name: "Accent colors" }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole("slider", { name: "Accent hue" }),
    ).not.toBeInTheDocument();
  });

  it("opens the Theme Lab drawer from a dev's cog", async () => {
    // The entry is dev-gated: this browser carries the editor hint.
    writeEditorHint();
    const user = userEvent.setup();
    render(
      <ThemeProvider
        initialColorScheme="dark"
        initialVisualStyle="fun"
        isVisualStyleLocked={false}
      >
        <AppearanceControls />
      </ThemeProvider>,
    );

    const panel = await openCog(user);
    await user.click(
      within(panel).getByRole("button", { name: "Open Theme Lab" }),
    );

    expect(getThemeLabOpen()).toBe(true);
    expect(
      screen.queryByRole("dialog", { name: "Appearance settings" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Appearance settings" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("withholds the Theme Lab when the caller vetoes it, keeping every axis", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider
        initialColorScheme="dark"
        initialVisualStyle="fun"
        isVisualStyleLocked={false}
      >
        <AppearanceControls allowThemeLab={false} />
      </ThemeProvider>,
    );

    const panel = await openCog(user);

    // The retained holding surface still exposes appearance preferences while intentionally
    // withholding Theme Lab authoring and sharing.
    expect(
      within(panel).queryByRole("button", { name: "Open Theme Lab" }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).getByRole("radiogroup", { name: "Mode" }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: "Accent colors" }),
    ).toBeInTheDocument();
  });

  it("puts the caller's class on the trigger itself, with no wrapper to take the offset", () => {
    render(
      <ThemeProvider
        initialColorScheme="dark"
        initialVisualStyle="fun"
        isVisualStyleLocked={false}
      >
        <AppearanceControls className="caller-positioning-hook" />
      </ThemeProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Appearance settings" }).className,
    ).toMatch(/caller-positioning-hook/);
  });
});
