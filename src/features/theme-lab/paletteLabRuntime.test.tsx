import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceTestProvider } from "@/test/AppearanceTestProvider";
import { PaletteLabLazy as PaletteLab } from "./PaletteLabLazy";
import {
  PALETTE_ATTRIBUTE,
  PALETTE_LAB_OVERRIDE_STYLE_ID,
  PALETTE_LAB_STORAGE_KEY,
} from "./paletteLabStorage";
import { setActiveEdits, setPaletteLabOpen } from "./paletteLabStore";
import { clearThemeBaselineCache } from "./presetBaselines";

/**
 * The runtime half of the lab: *stored envelope in → applied document state out*,
 * with the editor panel never opened.
 *
 * This is the regression suite the lazy-loading bug slipped through — every test
 * here mounts the lab and asserts on the injected override style, the persisted
 * envelope, or the panel's honest status line, without ever depending on the
 * editor having been loaded. The open state belongs to the protected route, so
 * these tests drive it directly instead of clicking a trigger.
 */

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

let setItemCalls = 0;

function installMockStorage({ failWrites = false } = {}) {
  const store = new Map<string, string>();
  setItemCalls = 0;
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === PALETTE_LAB_STORAGE_KEY) {
          setItemCalls += 1;
          if (failWrites) throw new Error("storage blocked");
        }
        store.set(key, String(value));
      },
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
  });
}

function overrideCss() {
  return document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID)?.textContent ?? "";
}

/**
 * Which shipped palette is worn. A preset is applied by naming it here — its
 * tokens live in the generated stylesheet — and only the visitor's own layer
 * goes into the injected element.
 */
function palette() {
  return document.documentElement.getAttribute(PALETTE_ATTRIBUTE);
}

function stored() {
  return window.localStorage.getItem(PALETTE_LAB_STORAGE_KEY);
}

function seed(envelope: unknown) {
  window.localStorage.setItem(PALETTE_LAB_STORAGE_KEY, JSON.stringify(envelope));
}

/** Drive the browser's "this tab is going away" signals. */
function hideTab() {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "hidden",
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  installMockStorage();
  document.documentElement.setAttribute("data-theme", "dark");
  document.documentElement.removeAttribute(PALETTE_ATTRIBUTE);
  document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID)?.remove();
  clearThemeBaselineCache();
  setPaletteLabOpen(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute(PALETTE_ATTRIBUTE);
  document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID)?.remove();
  delete (document as unknown as Record<string, unknown>).visibilityState;
});

describe("Theme Lab runtime", { timeout: 15_000 }, () => {
  it("applies a saved theme on mount, with the panel never opened", async () => {
    seed({
      version: 2,
      presetId: "abyss",
      overrides: { dark: { "--theme-accent": "#0ff0ff" }, light: {} },
    });

    render(<AppearanceTestProvider><PaletteLab /></AppearanceTestProvider>);

    // The preset and the editor's own edit both land before anything opens.
    await waitFor(() => expect(palette()).toBe("abyss"));
    expect(overrideCss()).toContain("--theme-accent:#0ff0ff");
    expect(screen.queryByRole("dialog", { name: "Theme Lab" })).not.toBeInTheDocument();
  });

  it("restores a legacy v1 blob and rewrites it in the current shape without the panel", async () => {
    seed({ dark: { "--theme-accent": "#123456" }, light: {} });

    render(<AppearanceTestProvider><PaletteLab /></AppearanceTestProvider>);

    expect(overrideCss()).toContain("--theme-accent:#123456");
    await waitFor(() => {
      expect(stored()).toContain('"version":4');
      expect(stored()).toContain('"activeThemeRef":{"kind":"preset","id":"orchid"}');
      expect(stored()).toContain('"--theme-accent":"#123456"');
    });
    expect(screen.queryByRole("dialog", { name: "Theme Lab" })).not.toBeInTheDocument();
  });

  it("migrates a v2 envelope to per-preset edits, preserving the rendered look", async () => {
    seed({
      version: 2,
      presetId: "abyss",
      overrides: { dark: { "--theme-accent": "#0ff0ff" }, light: {} },
    });

    render(<AppearanceTestProvider><PaletteLab /></AppearanceTestProvider>);

    // Same look as before the migration: Abyss plus the visitor's edit.
    await waitFor(() => expect(palette()).toBe("abyss"));
    expect(overrideCss()).toContain("--theme-accent:#0ff0ff");
    await waitFor(() => {
      const raw = stored() ?? "";
      expect(raw).toContain('"version":4');
      expect(raw).toContain('"activeThemeRef":{"kind":"preset","id":"abyss"}');
      // The edit now belongs to Abyss rather than to a single global map.
      expect(JSON.parse(raw).editsByPreset).toEqual({
        abyss: { dark: { "--theme-accent": "#0ff0ff" }, light: {} },
      });
      expect(JSON.parse(raw).customThemes).toEqual([]);
    });
  });

  it("keeps an unknown stored preset id and its edits, rendering the fallback look", async () => {
    seed({
      version: 3,
      activeThemeRef: { kind: "preset", id: "retired-preset" },
      editsByPreset: { "retired-preset": { dark: { "--theme-accent": "#123456" }, light: {} } },
      customThemes: [],
      shareFormat: 1,
    });

    render(<AppearanceTestProvider><PaletteLab /></AppearanceTestProvider>);

    // Renders: the visitor's own edits over the default look.
    expect(overrideCss()).toContain("--theme-accent:#123456");
    hideTab();
    const raw = stored();
    if (raw !== null) {
      expect(raw).toContain('"id":"retired-preset"');
      expect(JSON.parse(raw).editsByPreset["retired-preset"]).toBeTruthy();
    }
  });

  it("leaves storage untouched for a visitor who never customized", async () => {
    render(<AppearanceTestProvider><PaletteLab /></AppearanceTestProvider>);

    await waitFor(() => expect(setItemCalls).toBe(0));
    expect(stored()).toBeNull();
  });

  it("adopts a theme saved by another tab without echoing it back to storage", async () => {
    render(<AppearanceTestProvider><PaletteLab /></AppearanceTestProvider>);
    const writesBefore = setItemCalls;

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: PALETTE_LAB_STORAGE_KEY,
          newValue: JSON.stringify({
            version: 2,
            presetId: "twilight",
            overrides: { dark: {}, light: {} },
          }),
        }),
      );
    });

    expect(palette()).toBe("twilight");
    // A flush would have written any pending echo; the foreign value stands.
    hideTab();
    expect(setItemCalls).toBe(writesBefore);
  });

  it("persists edits made just before the tab is hidden", async () => {
    render(<AppearanceTestProvider><PaletteLab /></AppearanceTestProvider>);

    act(() => {
      setActiveEdits({ dark: { "--theme-accent": "#abcdef" }, light: {} });
    });
    expect(stored()).toBeNull(); // still inside the debounce window

    hideTab();

    expect(stored()).toContain("#abcdef");
  });

  it("persists edits made just before the page is unloaded", async () => {
    render(<AppearanceTestProvider><PaletteLab /></AppearanceTestProvider>);

    act(() => {
      setActiveEdits({ dark: { "--theme-accent": "#fedcba" }, light: {} });
    });
    expect(stored()).toBeNull();

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(stored()).toContain("#fedcba");
  });

  it("still lazy-loads the editor, and the restored look is already applied before it opens", async () => {
    seed({ version: 2, presetId: "abyss", overrides: { dark: {}, light: {} } });

    render(<AppearanceTestProvider><PaletteLab /></AppearanceTestProvider>);

    expect(palette()).toBe("abyss");
    expect(screen.queryByRole("dialog", { name: "Theme Lab" })).not.toBeInTheDocument();

    // The protected route owns the open state; the mount only follows it.
    act(() => setPaletteLabOpen(true));

    const panel = await screen.findByRole("dialog", { name: "Theme Lab" });
    expect(within(panel).getByRole("button", { name: /^Abyss/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("unpaints the document when the tool route unmounts", async () => {
    seed({
      version: 2,
      presetId: "abyss",
      overrides: { dark: { "--theme-accent": "#0ff0ff" }, light: {} },
    });

    const view = render(<AppearanceTestProvider><PaletteLab /></AppearanceTestProvider>);
    await waitFor(() => expect(palette()).toBe("abyss"));
    expect(overrideCss()).toContain("--theme-accent:#0ff0ff");

    // Navigating away from /dev/themes must not leave a public page wearing an
    // editor's in-progress palette for the rest of the session.
    view.unmount();

    expect(palette()).toBeNull();
    expect(overrideCss()).toBe("");
  });

  it("tells the visitor their theme is not being saved when storage writes fail", async () => {
    installMockStorage({ failWrites: true });

    render(<AppearanceTestProvider><PaletteLab /></AppearanceTestProvider>);
    act(() => setPaletteLabOpen(true));
    const panel = await screen.findByRole("dialog", { name: "Theme Lab" });
    expect(within(panel).getByText(/saved to this browser/)).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole("button", { name: /^Abyss/ }));

    await waitFor(() => {
      expect(within(panel).getByText(/not saved/i)).toBeInTheDocument();
    });
    expect(within(panel).queryByText(/saved to this browser/)).not.toBeInTheDocument();
  });
});
