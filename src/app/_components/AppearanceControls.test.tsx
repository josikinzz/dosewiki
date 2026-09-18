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
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as SiteFlavorModule from "@/config/siteFlavor";

import {
  ACCENT_HUE_STORAGE_KEY,
  COLOR_SCHEME_STORAGE_KEY,
  FONT_STORAGE_KEY,
  LETTER_SPACING_STORAGE_KEY,
  LINE_HEIGHT_STORAGE_KEY,
  SURFACE_HUE_STORAGE_KEY,
  TEXT_SIZE_STORAGE_KEY,
  ThemeProvider,
  VISUAL_STYLE_STORAGE_KEY,
} from "@/context/ThemeContext";
import { writeEditorHint } from "@/lib/auth/editorHint";
import {
  ACCENT_HUE_PROPERTY,
  DEFAULT_APPEARANCE_COLORS,
} from "@/theme/appearanceChroma";
import {
  READER_LEADING_ATTRIBUTE,
  READER_LEADING_PROPERTY,
} from "@/theme/appearanceTypography";
import {
  getThemeLabOpen,
  setThemeLabOpen,
} from "@/features/theme-lab/themeLabStore";
import { AppearanceCog, type AppearanceCogRows } from "./AppearanceCog";
import { AppearanceControls } from "./AppearanceControls";
import { SchemeToggle } from "./SchemeToggle";

vi.mock("@/config/siteFlavor", async (importOriginal) => {
  const actual = await importOriginal<typeof SiteFlavorModule>();
  return {
    ...actual,
    SITE_FLAVOR_CONFIG: actual.SITE_FLAVOR_CONFIGS.dosewiki,
    isEffectIndex: (config = actual.SITE_FLAVOR_CONFIGS.dosewiki) =>
      actual.isEffectIndex(config),
  };
});

vi.mock("@/components/common/Icon", () => ({
  // Faithful to the real one (`src/components/common/Icon.tsx:36-44`): the glyph is
  // `aria-hidden` and contributes no text. That is what makes the name queries below
  // load-bearing — an icon-only control that lost its `aria-label` has no accessible name
  // at all here, exactly as in the browser, so it fails instead of matching its icon name.
  Icon: ({ icon }: { icon: string }) => (
    <span data-testid="icon" data-icon={icon} aria-hidden="true" />
  ),
}));

// Radix Select scrolls the selected item into view on open; jsdom has no scrollIntoView.
beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

/** The font tab's reading-type sliders, in visual and focus order. */
const TYPE_SLIDER_NAMES = [
  "Text size",
  "Letter spacing",
  "Line height",
] as const;

/** The colour tab's four rails, in visual and focus order. */
const COLOR_SLIDER_NAMES = [
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
  provider: { isFontLocked?: boolean } = {},
) {
  return render(
    <ThemeProvider
      initialColorScheme="dark"
      initialVisualStyle="fun"
      isVisualStyleLocked={false}
      isFontLocked={false}
      {...provider}
    >
      <AppearanceCog {...ALL_ROWS} {...rows} />
      {children}
    </ThemeProvider>,
  );
}

async function openCog(user: UserEvent, readyRole: "button" | "radio" = "button") {
  await user.click(screen.getByRole("button", { name: "Appearance settings" }));

  const panel = await screen.findByRole("dialog", { name: "Appearance settings" });
  await within(panel).findAllByRole(readyRole);
  return panel;
}

/** Move the panel to the other tab through its own swap control. */
async function swapTab(user: UserEvent, panel: HTMLElement, target: "colour" | "font") {
  await user.click(
    within(panel).getByRole("button", {
      name: target === "colour" ? "Show colour controls" : "Show font controls",
    }),
  );
}

/**
 * Open the cog and land on the tab a test actually exercises. The panel opens on Colour
 * and keeps Font one swap away, but no test below should have to know that: asking for
 * the tab it needs keeps every case honest if the opening tab ever moves again.
 */
async function openCogOn(user: UserEvent, tab: "colour" | "font") {
  const panel = await openCog(user);

  if (tab === "font") {
    await swapTab(user, panel, "font");
  }

  return panel;
}

describe("AppearanceCog", () => {
  // Pin the starting appearance in both places the provider can restore it from, so the
  // checked Dark option and the Lexend default mean the same thing under every flavor.
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, "dark");
    window.localStorage.setItem(VISUAL_STYLE_STORAGE_KEY, "fun");
    setThemeLabOpen(false);
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.visualStyle = "fun";
    delete document.documentElement.dataset.font;
    document.documentElement.style.removeProperty("font-size");
    document.documentElement.removeAttribute(READER_LEADING_ATTRIBUTE);
  });

  it("presents one cog and nothing else until it is opened", async () => {
    const user = userEvent.setup();
    renderCog();

    screen.getByRole("button", { name: "Appearance settings" });
    // The whole point of the cog: the surface carries one control, not a row of them.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const panel = await openCog(user);
    // The panel opens on the colour tab: the look picker, the mode row, the type-glyph
    // swap beside them, and the four colour rails. No reading-type slider is mounted
    // until the swap.
    expect(within(panel).getAllByRole("slider").map((slider) => slider.getAttribute("aria-label"))).toEqual(
      [...COLOR_SLIDER_NAMES],
    );
    expect(
      within(panel).getByRole("button", { name: "Show font controls" }),
    ).toBeInTheDocument();
    expect(
      within(panel).queryByRole("slider", { name: "Text size" }),
    ).not.toBeInTheDocument();
  });

  it("parks the reading-type sliders on the site defaults, with the reset always at hand", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCogOn(user, "font");

    // A fresh reader parks on the defaults — ×1 text scale, the standard face's authored
    // negative tracking, the authored leading. The fractional axes run on scaled integer
    // slider domains (value × 100), so the parked DOM values are the scaled counts.
    // Paragraph spacing is absent: it is a fixed site value, not a preference, so no
    // slider offers it.
    const defaults: Record<(typeof TYPE_SLIDER_NAMES)[number], string> = {
      "Text size": "100",
      "Letter spacing": "-1",
      "Line height": "170",
    };
    for (const name of TYPE_SLIDER_NAMES) {
      const slider = within(panel).getByRole<HTMLInputElement>("slider", { name });
      expect(slider).toBeEnabled();
      expect(slider.value).toBe(defaults[name]);
    }

    // The reset is a permanent fixture of the tab, even with nothing to undo: the way
    // back should always be findable, and pressing it untouched is a no-op.
    const reset = within(panel).getByRole("button", { name: "Reset to defaults" });
    await user.click(reset);
    for (const name of TYPE_SLIDER_NAMES) {
      expect(within(panel).getByRole<HTMLInputElement>("slider", { name }).value).toBe(
        defaults[name],
      );
    }
    expect(window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY)).toBeNull();

    // After a change, it restores.
    fireEvent.change(within(panel).getByRole("slider", { name: "Text size" }), {
      target: { value: "105" },
    });
    await waitFor(() => {
      expect(window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY)).toBe("1.05");
    });
    await user.click(reset);
    await waitFor(() => {
      expect(window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY)).toBeNull();
      expect(
        within(panel).getByRole<HTMLInputElement>("slider", { name: "Text size" }).value,
      ).toBe("100");
    });
  });

  it("selects a face through the picker and paints the document attribute", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCogOn(user, "font");
    const font = within(panel).getByRole("combobox", { name: "Font" });
    expect(font).toHaveAttribute("data-appearance-axis", "font");
    expect(font).toHaveAttribute("data-appearance-value", "standard");

    fireEvent.click(font);
    fireEvent.click(await screen.findByRole("option", { name: "Inter" }));

    await waitFor(() => {
      expect(document.documentElement.dataset.font).toBe("inter");
      expect(window.localStorage.getItem(FONT_STORAGE_KEY)).toBe("inter");
      expect(within(panel).getByRole("combobox", { name: "Font" })).toHaveAttribute(
        "data-appearance-value",
        "inter",
      );
    });
    // The panel stays open, so the reader can compare faces without reopening it.
    expect(
      screen.getByRole("dialog", { name: "Appearance settings" }),
    ).toBeInTheDocument();
  });

  it("applies a reading-type drag immediately, with no save step", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCogOn(user, "font");
    const leading = within(panel).getByRole<HTMLInputElement>("slider", {
      name: "Line height",
    });

    // The leading slider runs on a ×100 integer domain (min 120, max 220, step 5).
    fireEvent.change(leading, { target: { value: "155" } });

    await waitFor(() => {
      // The setter ran with the number and the provider wrote the axis through — the
      // root attribute engaged and the custom property painted on the next animation
      // frame, the value persisted once the drag rested: no confirm, no save step.
      expect(document.documentElement).toHaveAttribute(READER_LEADING_ATTRIBUTE, "");
      expect(document.documentElement.style.getPropertyValue(READER_LEADING_PROPERTY)).toBe(
        "1.55",
      );
      expect(window.localStorage.getItem(LINE_HEIGHT_STORAGE_KEY)).toBe("1.55");
    });
    expect(leading.value).toBe("155");
    // The untouched axes did not move with it.
    expect(window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(LETTER_SPACING_STORAGE_KEY)).toBeNull();
  });

  it("keeps the reset scopes apart: type reset and color reset each undo only their own", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCogOn(user, "font");
    fireEvent.change(within(panel).getByRole("slider", { name: "Text size" }), {
      target: { value: "105" },
    });
    fireEvent.click(within(panel).getByRole("combobox", { name: "Font" }));
    fireEvent.click(await screen.findByRole("option", { name: "Titillium Web" }));
    await waitFor(() => {
      expect(document.documentElement.dataset.font).toBe("titillium");
    });

    await swapTab(user, panel, "colour");
    fireEvent.change(within(panel).getByRole("slider", { name: "Accent hue" }), {
      target: { value: "249" },
    });
    await user.click(within(panel).getByRole("button", { name: "Reset colors" }));

    await waitFor(() => {
      // The colour reset returns the rails to the authored palette...
      expect(window.localStorage.getItem(ACCENT_HUE_STORAGE_KEY)).toBeNull();
      expect(
        within(panel).getByRole<HTMLInputElement>("slider", { name: "Accent hue" }).value,
      ).toBe(String(DEFAULT_APPEARANCE_COLORS.fun.dark.accentHue));
      // ...and touches no type state.
      expect(document.documentElement.dataset.font).toBe("titillium");
      expect(window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY)).toBe("1.05");
    });

    await swapTab(user, panel, "font");
    await user.click(within(panel).getByRole("button", { name: "Reset to defaults" }));

    await waitFor(() => {
      // The type reset returns the sliders to their resting values and leaves the
      // face choice alone — the picker owns that axis.
      expect(document.documentElement.dataset.font).toBe("titillium");
      expect(window.localStorage.getItem(FONT_STORAGE_KEY)).toBe("titillium");
      expect(window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY)).toBeNull();
      // ...and touches no colour state.
      expect(window.localStorage.getItem(ACCENT_HUE_STORAGE_KEY)).toBeNull();
    });
    await swapTab(user, panel, "colour");
    expect(
      within(panel).getByRole<HTMLInputElement>("slider", { name: "Accent hue" }).value,
    ).toBe(String(DEFAULT_APPEARANCE_COLORS.fun.dark.accentHue));
  });

  it("swaps to the colour tab and back through the bare icons", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCogOn(user, "colour");

    // The colour tab: the Style picker, the two-way Mode pill, both rails always
    // open, and the swap control offering the way back.
    expect(
      [...panel.querySelectorAll("[data-appearance-axis]")].map((control) =>
        control.getAttribute("data-appearance-axis"),
      ),
    ).toEqual(["visual-style", "color-scheme"]);
    expect(within(panel).getAllByRole("slider").map((slider) => slider.getAttribute("aria-label"))).toEqual(
      COLOR_SLIDER_NAMES,
    );
    expect(
      within(panel).getByRole("button", { name: "Show font controls" }),
    ).toBeInTheDocument();
    expect(
      within(panel).queryByRole("slider", { name: "Text size" }),
    ).not.toBeInTheDocument();

    await swapTab(user, panel, "font");
    expect(
      within(panel).getByRole("slider", { name: "Text size" }),
    ).toBeInTheDocument();
  });

  it("flips the two-way Mode from its checked half and pins the scheme it shows", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCogOn(user, "colour");
    const mode = within(panel).getByRole("radiogroup", { name: "Mode" });
    expect(within(mode).getByRole("radio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // Two segments, the flip contract: pressing either half always lands the other.
    await user.click(within(mode).getByRole("radio", { name: "Dark" }));
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe("light");
    });

    await user.click(within(mode).getByRole("radio", { name: "Light" }));
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe("dark");
    });
  });

  it("renders a stored System preference as the scheme it resolves to", async () => {
    const user = userEvent.setup();
    const matches = false;
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
      window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, "system");
      renderCog();
      const panel = await openCogOn(user, "colour");
      const mode = within(panel).getByRole("radiogroup", { name: "Mode" });

      // A system reader is painted dark (the stub says so), so the Dark segment is the
      // one that reads checked; there is no System segment to render the preference.
      expect(within(mode).getByRole("radio", { name: "Dark" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      expect(document.documentElement.dataset.theme).toBe("dark");

      // Touching either segment pins that scheme explicitly: the two-option flip
      // contract, now that the menu no longer offers the follow-the-OS choice.
      await user.click(within(mode).getByRole("radio", { name: "Dark" }));
      await waitFor(() => {
        expect(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe("light");
        expect(document.documentElement.dataset.theme).toBe("light");
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("tracks the OS day/night flip while the stored preference is system", async () => {
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
      window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, "system");
      renderCog();
      await openCog(user);

      // An OS day/night flip restyles the page live with no reload, exactly as before.
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

  it("starts a touch drag on first contact anywhere along a colour slider", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCogOn(user, "colour");
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

  it("starts a touch drag on first contact along a reading-type slider", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCogOn(user, "font");
    const slider = within(panel).getByRole<HTMLInputElement>("slider", {
      name: "Text size",
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

    // The 80..130 scale domain quantized to 5-point steps: an eighth-track contact
    // from the left rounds onto ×0.85.
    fireEvent.pointerDown(slider, {
      clientX: 125,
      pointerId: 7,
      pointerType: "touch",
    });
    await waitFor(() => expect(slider.value).toBe("85"));
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(slider).toHaveFocus();
  });

  it("drives every document attribute from the two tabs", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCogOn(user, "font");
    fireEvent.click(within(panel).getByRole("combobox", { name: "Font" }));
    fireEvent.click(await screen.findByRole("option", { name: "Blinker" }));
    await swapTab(user, panel, "colour");
    await user.click(within(panel).getByRole("radio", { name: "Light" }));

    await waitFor(() => {
      expect(document.documentElement.dataset.font).toBe("blinker");
      expect(document.documentElement.dataset.theme).toBe("light");
    });
  });

  it("holds no state of its own: every mounted control reflects one provider", async () => {
    const user = userEvent.setup();
    renderCog(
      {},
      // A second, independently mounted pill. Were the controls holding local state, these
      // would disagree with the cog's panel after the first selection.
      <SchemeToggle />,
    );

    const panel = await openCogOn(user, "colour");
    // Driven from inside the panel: selecting the loose pill instead would be an outside
    // click and dismiss the popover before the assertion.
    await user.click(within(panel).getByRole("radio", { name: "Light" }));

    await waitFor(() => {
      const lightOptions = screen.getAllByRole("radio", { name: "Light" });
      expect(lightOptions).toHaveLength(2);
      expect(
        lightOptions.map((option) => option.getAttribute("aria-checked")),
      ).toEqual(["true", "true"]);
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

  it("applies a colour drag immediately, with the panel left open for comparison", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCogOn(user, "colour");
    const accentHue = within(panel).getByRole<HTMLInputElement>("slider", {
      name: "Accent hue",
    });

    fireEvent.change(accentHue, { target: { value: "249" } });

    await waitFor(() => {
      expect(
        document.documentElement.style.getPropertyValue(ACCENT_HUE_PROPERTY),
      ).toBe("249");
      expect(window.localStorage.getItem(`${ACCENT_HUE_STORAGE_KEY}-fun`)).toBe("249");
    });
    expect(accentHue.value).toBe("249");
    // The untouched axis did not move with it.
    expect(window.localStorage.getItem(`${SURFACE_HUE_STORAGE_KEY}-fun`)).toBeNull();
    expect(
      screen.getByRole("dialog", { name: "Appearance settings" }),
    ).toBeInTheDocument();
  });

  it("opens with the colour rails parked on each appearance combination's defaults", async () => {
    const user = userEvent.setup();
    renderCog();

    const panel = await openCogOn(user, "colour");

    // Every rail is live — saturation 0 is a coordinate, not a disabled state — and a
    // fresh reader parks on the default Fun-dark matrix entry.
    const defaults = DEFAULT_APPEARANCE_COLORS.fun.dark;
    const values: Record<(typeof COLOR_SLIDER_NAMES)[number], string> = {
      "Background hue": String(defaults.surfaceHue),
      "Background saturation": String(Math.round(defaults.surfaceLevel * 100)),
      "Accent hue": String(defaults.accentHue),
      "Accent saturation": String(Math.round(defaults.accentLevel * 100)),
    };
    for (const name of COLOR_SLIDER_NAMES) {
      const slider = within(panel).getByRole<HTMLInputElement>("slider", { name });
      expect(slider).toBeEnabled();
      expect(slider.value).toBe(values[name]);
    }

    // Saturation 0 is a position on the axis, not a special mode: the rails stay live.
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

  it("drops a locked row rather than rendering it inert", async () => {
    const user = userEvent.setup();
    renderCog({
      showVisualStyle: false,
      showSurface: false,
      showAccent: false,
      showFont: false,
      showMoreSettings: false,
    });

    const panel = await openCog(user, "radio");

    expect(
      within(panel).queryByRole("combobox", { name: "Font" }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole("combobox", { name: "Style" }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole("slider", { name: "Accent hue" }),
    ).not.toBeInTheDocument();
    expect(within(panel).queryByRole("slider")).not.toBeInTheDocument();
    // No swap control at all: a panel with one tab does not offer navigation.
    expect(
      within(panel).queryByRole("button", { name: "Show font controls" }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole("button", { name: "Show colour controls" }),
    ).not.toBeInTheDocument();
    // No link at all, rather than no link with a particular name: the guarantee is that a
    // reader is never handed an editor route, and stating it this way cannot quietly stop
    // meaning anything if the link's name ever changes.
    expect(within(panel).queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders no cog at all when a build offers a reader nothing", () => {
    renderCog({
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
    "opens a complete colour tab in $visualStyle $colorScheme",
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

      const panel = await openCogOn(user, "colour");

      expect(panel).toHaveClass("theme-overlay-surface");
      expect(panel.querySelectorAll("[data-appearance-axis]")).toHaveLength(2);
      // Both colour axes work on both visual styles: the accent pair rotates
      // and re-saturates the Pro --ei-* ramp, and the surface pair drives the
      // additive Pro surface blocks (c + K × level over the authored
      // charcoal), so no rail is disabled anywhere in the matrix.
      for (const name of COLOR_SLIDER_NAMES) {
        expect(within(panel).getByRole("slider", { name }), name).toBeEnabled();
      }
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

  it("keeps every reader row on the locked-style build: the style axis is Theme Lab's now", async () => {
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

    const panel = await openCogOn(user, "colour");

    // The reader panel never offered the style axis after the tab reshape; a locked
    // style changes nothing about what a reader is offered here.
    expect(
      within(panel).getByRole("radiogroup", { name: "Mode" }),
    ).toBeInTheDocument();
    await swapTab(user, panel, "font");
    expect(
      within(panel).getByRole("combobox", { name: "Font" }),
    ).toBeInTheDocument();
  });

  it("opens on the colour tab alone when the publication locks the type axis", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider
        initialColorScheme="dark"
        initialVisualStyle="pro"
        isFontLocked
      >
        <AppearanceControls />
      </ThemeProvider>,
    );

    const panel = await openCog(user);

    expect(
      within(panel).queryByRole("combobox", { name: "Font" }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole("slider", { name: "Text size" }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole("button", { name: "Show font controls" }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).getByRole("radiogroup", { name: "Mode" }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("slider", { name: "Accent hue" }),
    ).toBeInTheDocument();
  });

  it("omits the accent rails when the publication locks the accent axis", async () => {
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

    const panel = await openCogOn(user, "colour");

    expect(
      within(panel).queryByRole("slider", { name: "Accent hue" }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole("slider", { name: "Accent saturation" }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).getByRole("slider", { name: "Background hue" }),
    ).toBeInTheDocument();
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

    const panel = await openCogOn(user, "colour");
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

    const panel = await openCogOn(user, "colour");

    // The retained holding surface still exposes appearance preferences while intentionally
    // withholding Theme Lab authoring and sharing.
    expect(
      within(panel).queryByRole("button", { name: "Open Theme Lab" }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).getByRole("radiogroup", { name: "Mode" }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("slider", { name: "Accent hue" }),
    ).toBeInTheDocument();
  });

});
