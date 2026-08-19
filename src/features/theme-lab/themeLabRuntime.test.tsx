import type { PropsWithChildren } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { SURFACE_ATTRIBUTE } from "@/theme/surfaceStylesheet";
import { ACCENT_ATTRIBUTE } from "@/theme/accentStylesheet";
import { ThemeLabLazy as ThemeLab } from "./ThemeLabLazy";
import { DEFAULT_LOOK, lookKey } from "./themeLabLook";
import {
  THEME_LAB_OVERRIDE_STYLE_ID,
  THEME_LAB_PERSIST_DELAY_MS,
  THEME_LAB_STORAGE_KEY,
  emptyOverrides,
} from "./themeLabStorage";
import { setActiveEdits, setThemeLabOpen } from "./themeLabStore";
import { clearThemeBaselineCache } from "./presetBaselines";

/**
 * The runtime half of the lab: *stored envelope in → applied document state out*,
 * with the editor panel never opened.
 *
 * This is the regression suite the lazy-loading bug slipped through — every test
 * here mounts the global lab and asserts on the injected override style, the
 * persisted envelope, or the panel's honest status line without requiring the
 * editor to have opened first.
 */

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

/**
 * The appearance owner, with all four axes pinned.
 *
 * Pinned rather than left to the publication's opening choice because the look is
 * the lab's storage key now: a test that let the flavor config pick the accent
 * would be seeding envelopes under a key it could not name. These values are the
 * base look, so a legacy envelope's best-effort migration — which can only guess
 * at the base — lands on the look under test.
 */
function Harness({ children }: PropsWithChildren) {
  return (
    <ThemeProvider
      initialColorScheme="dark"
      initialVisualStyle="fun"
      initialAccent={DEFAULT_LOOK.accent}
      initialSurface={DEFAULT_LOOK.surface}
      isVisualStyleLocked={false}
    >
      {children}
    </ThemeProvider>
  );
}

/** Moves the reader onto another surface through the same context the appearance
 *  controls use, which is the only thing that changes the lab's active look. */
function SurfaceControls() {
  const { setSurface } = useTheme();
  return (
    <>
      <button type="button" onClick={() => setSurface("abyss")}>
        wear abyss
      </button>
      <button type="button" onClick={() => setSurface(DEFAULT_LOOK.surface)}>
        wear base
      </button>
    </>
  );
}

const BASE_LOOK = lookKey(DEFAULT_LOOK);
const ABYSS_LOOK = lookKey({ ...DEFAULT_LOOK, surface: "abyss" });

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
  // Left over from an earlier render, these would out-rank the pinned props: the
  // provider adopts whatever the bootstrap painted before trusting its own initial
  // values.
  document.documentElement.removeAttribute(SURFACE_ATTRIBUTE);
  document.documentElement.removeAttribute(ACCENT_ATTRIBUTE);
  document.getElementById(THEME_LAB_OVERRIDE_STYLE_ID)?.remove();
  clearThemeBaselineCache();
  setThemeLabOpen(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute(SURFACE_ATTRIBUTE);
  document.documentElement.removeAttribute(ACCENT_ATTRIBUTE);
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
      activeAccentId: DEFAULT_LOOK.accent,
      activeSurfaceId: DEFAULT_LOOK.surface,
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

  it("leaves storage untouched for a visitor who never customized", async () => {
    render(<Harness><ThemeLab /></Harness>);

    await waitFor(() => expect(setItemCalls).toBe(0));
    expect(stored()).toBeNull();
  });

  it("adopts edits saved by another tab without echoing them back to storage", async () => {
    render(<Harness><ThemeLab /></Harness>);
    const writesBefore = setItemCalls;

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: THEME_LAB_STORAGE_KEY,
          newValue: JSON.stringify({
            version: 5,
            editsByLook: { [BASE_LOOK]: { dark: { "--theme-accent": "#fa11ed" }, light: {} } },
            roleEditsByLook: {},
          }),
        }),
      );
    });

    expect(overrideCss()).toContain("--theme-accent:#fa11ed");
    // A flush would have written any pending echo; the foreign value stands.
    hideTab();
    expect(setItemCalls).toBe(writesBefore);
  });

  it("persists edits made just before the tab is hidden", async () => {
    render(<Harness><ThemeLab /></Harness>);

    act(() => {
      setActiveEdits({ dark: { "--theme-accent": "#abcdef" }, light: {} });
    });
    expect(stored()).toBeNull(); // still inside the debounce window

    hideTab();

    expect(stored()).toContain("#abcdef");
  });

  it("persists edits made just before the page is unloaded", async () => {
    render(<Harness><ThemeLab /></Harness>);

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
    render(<Harness><ThemeLab /></Harness>);

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
        <SurfaceControls />
        <ThemeLab />
      </Harness>,
    );

    act(() => {
      setActiveEdits({ dark: { "--theme-accent": "#abcdef" }, light: {} });
    });
    expect(overrideCss()).toContain("--theme-accent:#abcdef");

    // Changing surface is navigation, not an edit: the base look's tweak stops
    // applying because it was never a statement about this palette.
    await userEvent.click(screen.getByRole("button", { name: "wear abyss" }));
    await waitFor(() => expect(overrideCss()).not.toContain("#abcdef"));

    // The new look starts clean and takes its own edit, which does not disturb the
    // one left behind.
    act(() => {
      setActiveEdits({ dark: { "--theme-accent": "#013579" }, light: {} });
    });
    expect(overrideCss()).toContain("--theme-accent:#013579");
    expect(overrideCss()).not.toContain("#abcdef");

    await userEvent.click(screen.getByRole("button", { name: "wear base" }));
    await waitFor(() => expect(overrideCss()).toContain("--theme-accent:#abcdef"));
    expect(overrideCss()).not.toContain("#013579");

    // Both looks are saved, under their own keys.
    hideTab();
    expect(JSON.parse(stored() ?? "{}").editsByLook).toEqual({
      [BASE_LOOK]: { dark: { "--theme-accent": "#abcdef" }, light: {} },
      [ABYSS_LOOK]: { dark: { "--theme-accent": "#013579" }, light: {} },
    });
  });

  it("writes nothing when the reader only changes their look", async () => {
    render(
      <Harness>
        <SurfaceControls />
        <ThemeLab />
      </Harness>,
    );

    await userEvent.click(screen.getByRole("button", { name: "wear abyss" }));
    hideTab();

    // The four appearance axes are the reader's own preference, saved by the
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
