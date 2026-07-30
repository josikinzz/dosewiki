import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaletteLabLazy as PaletteLab } from "./PaletteLabLazy";
import { PaletteLabTrigger } from "./PaletteLabTrigger";
import { PALETTE_LAB_OVERRIDE_STYLE_ID, PALETTE_LAB_STORAGE_KEY } from "./paletteLabStorage";
import { setPaletteLabOpen, updatePaletteLabTheme } from "./paletteLabStore";

/**
 * The runtime half of the lab: *stored envelope in → applied document state out*,
 * with the editor panel never opened.
 *
 * This is the regression suite the lazy-loading bug slipped through — every test
 * here mounts the global lab and asserts on the injected override style, the
 * persisted envelope, or the panel's honest status line, without ever depending
 * on the editor having been loaded.
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
        setItemCalls += 1;
        if (failWrites) throw new Error("storage blocked");
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
  document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID)?.remove();
  setPaletteLabOpen(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID)?.remove();
  delete (document as unknown as Record<string, unknown>).visibilityState;
});

describe("Palette Lab runtime", { timeout: 15_000 }, () => {
  it("applies a saved theme on load with no trigger rendered and the panel never opened", async () => {
    seed({
      version: 2,
      presetId: "abyss",
      overrides: { dark: { "--theme-accent": "#0ff0ff" }, light: {} },
    });

    render(<PaletteLab />);

    // The preset layer and the visitor's own edit both land, on a page that
    // offers no way to open the lab at all.
    await waitFor(() => expect(overrideCss()).toContain("--theme-panel-base:#07202e"));
    expect(overrideCss()).toContain("--theme-accent:#0ff0ff");
    expect(screen.queryByRole("dialog", { name: "Palette Lab" })).not.toBeInTheDocument();
  });

  it("restores a legacy v1 blob and rewrites it in the current shape without the panel", async () => {
    seed({ dark: { "--theme-accent": "#123456" }, light: {} });

    render(<PaletteLab />);

    expect(overrideCss()).toContain("--theme-accent:#123456");
    await waitFor(() => {
      expect(stored()).toContain('"version":2');
      expect(stored()).toContain('"presetId":"orchid"');
      expect(stored()).toContain('"--theme-accent":"#123456"');
    });
    expect(screen.queryByRole("dialog", { name: "Palette Lab" })).not.toBeInTheDocument();
  });

  it("leaves storage untouched for a visitor who never customized", async () => {
    render(<PaletteLab />);

    await waitFor(() => expect(setItemCalls).toBe(0));
    expect(stored()).toBeNull();
  });

  it("adopts a theme saved by another tab without echoing it back to storage", async () => {
    render(<PaletteLab />);
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

    expect(overrideCss()).toContain("--theme-panel-base:#131034");
    // A flush would have written any pending echo; the foreign value stands.
    hideTab();
    expect(setItemCalls).toBe(writesBefore);
  });

  it("persists edits made just before the tab is hidden", async () => {
    render(<PaletteLab />);

    act(() => {
      updatePaletteLabTheme({ overrides: { dark: { "--theme-accent": "#abcdef" }, light: {} } });
    });
    expect(stored()).toBeNull(); // still inside the debounce window

    hideTab();

    expect(stored()).toContain("#abcdef");
  });

  it("persists edits made just before the page is unloaded", async () => {
    render(<PaletteLab />);

    act(() => {
      updatePaletteLabTheme({ overrides: { dark: { "--theme-accent": "#fedcba" }, light: {} } });
    });
    expect(stored()).toBeNull();

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(stored()).toContain("#fedcba");
  });

  it("still lazy-loads the editor, and the restored look is already applied before it opens", async () => {
    seed({ version: 2, presetId: "abyss", overrides: { dark: {}, light: {} } });

    render(
      <>
        <PaletteLabTrigger />
        <PaletteLab />
      </>,
    );

    expect(overrideCss()).toContain("--theme-panel-base:#07202e");
    expect(screen.queryByRole("dialog", { name: "Palette Lab" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Open Palette Lab/i }));

    const panel = await screen.findByRole("dialog", { name: "Palette Lab" });
    expect(within(panel).getByRole("button", { name: /^Abyss/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("tells the visitor their theme is not being saved when storage writes fail", async () => {
    installMockStorage({ failWrites: true });

    render(
      <>
        <PaletteLabTrigger />
        <PaletteLab />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: /Open Palette Lab/i }));
    const panel = await screen.findByRole("dialog", { name: "Palette Lab" });
    expect(within(panel).getByText(/saved to this browser/)).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole("button", { name: /^Abyss/ }));

    await waitFor(() => {
      expect(within(panel).getByText(/not saved/i)).toBeInTheDocument();
    });
    expect(within(panel).queryByText(/saved to this browser/)).not.toBeInTheDocument();
  });
});
