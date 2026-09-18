import type { PropsWithChildren } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { ThemeLabLazy as ThemeLab } from "./ThemeLabLazy";
import { ThemeLabRuntimeMount } from "./ThemeLabRuntimeMount";
import { DEFAULT_LOOK, lookKey } from "./themeLabLook";
import {
  THEME_LAB_OVERRIDE_STYLE_ID,
  THEME_LAB_PERSIST_DELAY_MS,
  THEME_LAB_STORAGE_KEY,
  emptyOverrides,
  serializeEnvelope,
} from "./themeLabStorage";
import { setActiveEdits, setThemeLabOpen } from "./themeLabStore";
import { clearThemeBaselineCache } from "./presetBaselines";

/**
 * Runtime cases mount the persistence owner directly before editing its store.
 * Lazy integration cases exercise saved state and cross-tab activation without
 * opening the panel, then assert on document state and persisted envelopes.
 */

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

/**
 * The appearance owner, with the axes pinned.
 *
 * Pinned rather than left to the publication's opening choice because the look is
 * the lab's storage key now: a test that let the flavor config pick the style
 * would be seeding envelopes under a key it could not name. Fun is the base look,
 * so a legacy envelope's best-effort migration — which can only guess at the base
 * — lands on the look under test.
 */
function Harness({ children }: PropsWithChildren) {
  return (
    <ThemeProvider
      initialColorScheme="dark"
      initialVisualStyle={DEFAULT_LOOK.visualStyle}
      isVisualStyleLocked={false}
    >
      {children}
    </ThemeProvider>
  );
}

/** Flips the reader's visual style through the same context the appearance
 *  controls use, which is the only thing that changes the lab's active look. */
function StyleControls() {
  const { setVisualStyle } = useTheme();
  return (
    <>
      <button type="button" onClick={() => setVisualStyle("pro")}>
        wear pro
      </button>
      <button type="button" onClick={() => setVisualStyle(DEFAULT_LOOK.visualStyle)}>
        wear fun
      </button>
    </>
  );
}

const BASE_LOOK = lookKey(DEFAULT_LOOK);
const PRO_LOOK = lookKey({ visualStyle: "pro" });

let setItemCalls = 0;

function installMockStorage({ failWrites = false } = {}) {
  const store = new Map<string, string>();
  setItemCalls = 0;
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === THEME_LAB_STORAGE_KEY) {
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
  return document.getElementById(THEME_LAB_OVERRIDE_STYLE_ID)?.textContent ?? "";
}

function stored() {
  return window.localStorage.getItem(THEME_LAB_STORAGE_KEY);
}

function seed(envelope: unknown) {
  window.localStorage.setItem(THEME_LAB_STORAGE_KEY, JSON.stringify(envelope));
}

/** Drive the browser's "this tab is going away" signals. */
function hideTab() {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "hidden",
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Let the persist debounce elapse, so an armed write either lands or proves it
 *  was cancelled.
 *
 *  Executor form rather than `Promise.withResolvers`: this project compiles
 *  against the ES2020 lib, where that static does not exist. */
function waitOutDebounce() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, THEME_LAB_PERSIST_DELAY_MS + 50);
  });
}

beforeEach(() => {
  installMockStorage();
  document.documentElement.setAttribute("data-theme", "dark");
  // Left over from an earlier render, this would out-rank the pinned props: the
  // provider adopts whatever the bootstrap painted before trusting its own initial
  // values.
  document.documentElement.removeAttribute("data-visual-style");
  document.getElementById(THEME_LAB_OVERRIDE_STYLE_ID)?.remove();
  clearThemeBaselineCache();
  setThemeLabOpen(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-visual-style");
  document.getElementById(THEME_LAB_OVERRIDE_STYLE_ID)?.remove();
  delete (document as unknown as Record<string, unknown>).visibilityState;
});

describe("Theme Lab runtime", { timeout: 15_000 }, () => {
  it("applies saved edits on mount, with the panel never opened", async () => {
    seed({
      version: 5,
      editsByLook: { [BASE_LOOK]: { dark: { "--theme-accent": "#0ff0ff" }, light: {} } },
      roleEditsByLook: {},
    });

    render(<Harness><ThemeLab /></Harness>);

    // The saved edit lands before anything opens.
    await waitFor(() => expect(overrideCss()).toContain("--theme-accent:#0ff0ff"));
    expect(screen.queryByRole("dialog", { name: "Theme Lab" })).not.toBeInTheDocument();
  });

  it("restores a legacy v1 blob and rewrites it in the current shape without the panel", async () => {
    seed({ dark: { "--theme-accent": "#123456" }, light: {} });

    render(<Harness><ThemeLab /></Harness>);

    expect(overrideCss()).toContain("--theme-accent:#123456");
    await waitFor(() => {
      expect(stored()).toContain('"version":5');
      expect(JSON.parse(stored() ?? "{}").editsByLook).toEqual({
        [BASE_LOOK]: { dark: { "--theme-accent": "#123456" }, light: {} },
      });
    });
    expect(screen.queryByRole("dialog", { name: "Theme Lab" })).not.toBeInTheDocument();
  });

  it("migrates a v4 envelope to the worn look's edits and drops the looks that no longer exist", async () => {
    seed({
      version: 4,
      activeThemeRef: { kind: "preset", id: "abyss" },
      // The legacy colourway axes, as an old build recorded them: the base ids.
      activeAccentId: "default",
      activeSurfaceId: "orchid",
      editsByPreset: {
        abyss: { dark: { "--theme-accent": "#0ff0ff" }, light: {} },
        canopy: { dark: { "--theme-accent": "#deadbe" }, light: {} },
      },
      customThemes: [
        {
          id: "mine",
          name: "Mine",
          overrides: { dark: { "--theme-accent": "#c0ffee" }, light: {} },
        },
      ],
      shareFormat: 1,
    });

    render(<Harness><ThemeLab /></Harness>);

    // The look the visitor was wearing keeps its edits, re-filed under the axes the
    // envelope recorded. The other named themes and the custom slot are gone: the
    // looks they diverged from no longer exist, and their literal colours would
    // paint over a palette they were never sampled against.
    await waitFor(() => expect(overrideCss()).toContain("--theme-accent:#0ff0ff"));
    expect(overrideCss()).not.toContain("#deadbe");
    expect(overrideCss()).not.toContain("#c0ffee");
    await waitFor(() => {
      const raw = stored() ?? "";
      expect(raw).toContain('"version":5');
      expect(raw).not.toContain("#deadbe");
      expect(raw).not.toContain("#c0ffee");
      expect(JSON.parse(raw).editsByLook).toEqual({
        [BASE_LOOK]: { dark: { "--theme-accent": "#0ff0ff" }, light: {} },
      });
    });
  });

  it("re-files a pre-hue v5 envelope's base-look edits and drops retired colourway looks", async () => {
    seed({
      version: 5,
      editsByLook: {
        // The base triple describes the palette this build still ships.
        "fun|default|orchid": { dark: { "--theme-accent": "#0ff0ff" }, light: {} },
        // A retired colourway's look: literal colours sampled against a palette
        // this build does not render.
        "fun|blue|abyss": { dark: { "--theme-accent": "#deadbe" }, light: {} },
      },
      roleEditsByLook: {},
    });

    render(<Harness><ThemeLab /></Harness>);

    await waitFor(() => expect(overrideCss()).toContain("--theme-accent:#0ff0ff"));
    expect(overrideCss()).not.toContain("#deadbe");
  });

  it("leaves storage untouched for a visitor who never customized", async () => {
    render(<Harness><ThemeLab /></Harness>);

    await waitFor(() => expect(setItemCalls).toBe(0));
    expect(stored()).toBeNull();
  });

  it("adopts edits saved by another tab without echoing them back to storage", async () => {
    render(<Harness><ThemeLab /></Harness>);
    const newValue = serializeEnvelope({
      editsByLook: { [BASE_LOOK]: { dark: { "--theme-accent": "#fa11ed" }, light: {} } },
    });
    // Native storage events reach this tab after shared storage has changed.
    window.localStorage.setItem(THEME_LAB_STORAGE_KEY, newValue);
    const writesBefore = setItemCalls;

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: THEME_LAB_STORAGE_KEY,
          newValue,
        }),
      );
    });

    await waitFor(() => expect(overrideCss()).toContain("--theme-accent:#fa11ed"));
    // A flush would have written any pending echo; the foreign value stands.
    hideTab();
    expect(setItemCalls).toBe(writesBefore);

    window.localStorage.removeItem(THEME_LAB_STORAGE_KEY);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: THEME_LAB_STORAGE_KEY,
        oldValue: newValue,
        newValue: null,
      }));
    });
    expect(overrideCss()).toBe("");
    hideTab();
    expect(stored()).toBeNull();
    expect(setItemCalls).toBe(writesBefore);
  });

  it("persists edits made just before the tab is hidden", async () => {
    render(<Harness><ThemeLabRuntimeMount /></Harness>);

    act(() => {
      setActiveEdits({ dark: { "--theme-accent": "#abcdef" }, light: {} });
    });
    expect(stored()).toBeNull(); // still inside the debounce window

    hideTab();

    expect(stored()).toContain("#abcdef");
  });

  it("persists edits made just before the page is unloaded", async () => {
    render(<Harness><ThemeLabRuntimeMount /></Harness>);

    act(() => {
      setActiveEdits({ dark: { "--theme-accent": "#fedcba" }, light: {} });
    });
    expect(stored()).toBeNull();

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(stored()).toContain("#fedcba");
  });

  it("does not resurrect an edit the reader undid inside the debounce window", async () => {
    render(<Harness><ThemeLabRuntimeMount /></Harness>);

    // Both moves land inside one debounce window, so the edit's write is still
    // armed when the reset supersedes it. The armed value has to be dropped
    // rather than left to fire: a reader who resets a token straight after
    // changing it used to watch the edit save itself anyway.
    act(() => {
      setActiveEdits({ dark: { "--theme-accent": "#abcdef" }, light: {} });
    });
    act(() => {
      setActiveEdits(emptyOverrides());
    });
    expect(stored()).toBeNull();

    await waitOutDebounce();

    // Back to what storage already held — which, for a visitor who had saved
    // nothing, means nothing was ever written.
    expect(stored()).toBeNull();
    expect(overrideCss()).toBe("");
  });

  it("keeps each look's edits to itself, and gives them back when the look returns", async () => {
    render(
      <Harness>
        <StyleControls />
        <ThemeLabRuntimeMount />
      </Harness>,
    );

    act(() => {
      setActiveEdits({ dark: { "--theme-accent": "#abcdef" }, light: {} });
    });
    expect(overrideCss()).toContain("--theme-accent:#abcdef");

    // Changing style is navigation, not an edit: the base look's tweak stops
    // applying because it was never a statement about Pro's re-seated palette.
    await userEvent.click(screen.getByRole("button", { name: "wear pro" }));
    await waitFor(() => expect(overrideCss()).not.toContain("#abcdef"));

    // The new look starts clean and takes its own edit, which does not disturb the
    // one left behind.
    act(() => {
      setActiveEdits({ dark: { "--theme-accent": "#013579" }, light: {} });
    });
    expect(overrideCss()).toContain("--theme-accent:#013579");
    expect(overrideCss()).not.toContain("#abcdef");

    await userEvent.click(screen.getByRole("button", { name: "wear fun" }));
    await waitFor(() => expect(overrideCss()).toContain("--theme-accent:#abcdef"));
    expect(overrideCss()).not.toContain("#013579");

    // Both looks are saved, under their own keys.
    hideTab();
    expect(JSON.parse(stored() ?? "{}").editsByLook).toEqual({
      [BASE_LOOK]: { dark: { "--theme-accent": "#abcdef" }, light: {} },
      [PRO_LOOK]: { dark: { "--theme-accent": "#013579" }, light: {} },
    });
  });

  it("writes nothing when the reader only changes their look", async () => {
    render(
      <Harness>
        <StyleControls />
        <ThemeLabRuntimeMount />
      </Harness>,
    );

    await userEvent.click(screen.getByRole("button", { name: "wear pro" }));
    hideTab();

    // The appearance axes are the reader's own preference, saved by the
    // appearance owner under its own keys. This envelope holds edits, so a look
    // with no edits on either side of the switch is nothing for it to say.
    expect(stored()).toBeNull();
    expect(setItemCalls).toBe(0);
  });

  it("still lazy-loads the editor, and the restored edits are already applied before it opens", async () => {
    seed({
      version: 5,
      editsByLook: { [BASE_LOOK]: { dark: { "--theme-accent": "#0ff0ff" }, light: {} } },
      roleEditsByLook: {},
    });

    render(<Harness><ThemeLab /></Harness>);

    expect(overrideCss()).toContain("--theme-accent:#0ff0ff");
    expect(screen.queryByRole("dialog", { name: "Theme Lab" })).not.toBeInTheDocument();

    // The shared store drives the globally mounted panel.
    act(() => setThemeLabOpen(true));

    await screen.findByRole("dialog", { name: "Theme Lab" });
    expect(overrideCss()).toContain("--theme-accent:#0ff0ff");
  });

  it("unpaints the document when the global app mount is torn down", async () => {
    seed({
      version: 5,
      editsByLook: { [BASE_LOOK]: { dark: { "--theme-accent": "#0ff0ff" }, light: {} } },
      roleEditsByLook: {},
    });

    const view = render(<Harness><ThemeLab /></Harness>);
    await waitFor(() => expect(overrideCss()).toContain("--theme-accent:#0ff0ff"));

    // A full app teardown releases the runtime and its document-level styles.
    view.unmount();

    expect(overrideCss()).toBe("");
  });

  it("tells the visitor their theme is not being saved when storage writes fail", async () => {
    installMockStorage({ failWrites: true });

    render(<Harness><ThemeLab /></Harness>);
    act(() => setThemeLabOpen(true));
    const panel = await screen.findByRole("dialog", { name: "Theme Lab" });
    expect(within(panel).getByText(/saved to this browser/)).toBeInTheDocument();

    act(() => {
      setActiveEdits({ dark: { "--theme-accent": "#abcdef" }, light: {} });
    });
    hideTab();

    await waitFor(() => {
      expect(within(panel).getByText(/not saved/i)).toBeInTheDocument();
    });
    expect(within(panel).queryByText(/saved to this browser/)).not.toBeInTheDocument();
  });
});
