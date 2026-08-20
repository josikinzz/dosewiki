import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { APPEARANCE_META_COLORS, getAppearanceMetaColor } from "@/theme";
import {
  DEFAULT_ACCENT_LEVEL,
  DEFAULT_SURFACE_LEVEL,
} from "@/theme/appearanceChroma";
import { LEGACY_ACCENT_TO_HUE } from "@/theme/accents";
import { LEGACY_SURFACE_TO_HUE } from "@/theme/surfaces";
import {
  ACCENT_CHROMA_STORAGE_KEY,
  ACCENT_HUE_STORAGE_KEY,
  ACCENT_STORAGE_KEY,
  COLOR_SCHEME_STORAGE_KEY,
  SURFACE_CHROMA_STORAGE_KEY,
  SURFACE_HUE_STORAGE_KEY,
  SURFACE_STORAGE_KEY,
  THEME_META_ID,
  VISUAL_STYLE_STORAGE_KEY,
  ThemeProvider,
  useTheme,
  type ColorScheme,
  type VisualStyle,
} from "./ThemeContext";

function AppearanceProbe() {
  const {
    colorScheme,
    visualStyle,
    surfaceChroma,
    accentChroma,
    setSurfaceChroma,
    surfaceHue,
    accentHue,
    setSurfaceHue,
    setAccentHue,
    isVisualStyleLocked,
    isAccentLocked,
    toggleColorScheme,
    toggleVisualStyle,
  } = useTheme();

  return (
    <div>
      <span data-testid="color-scheme">{colorScheme}</span>
      <span data-testid="visual-style">{visualStyle}</span>
      <span data-testid="style-locked">{String(isVisualStyleLocked)}</span>
      <span data-testid="accent-locked">{String(isAccentLocked)}</span>
      <span data-testid="surface-chroma">{String(surfaceChroma)}</span>
      <span data-testid="accent-chroma">{String(accentChroma)}</span>
      <span data-testid="surface-hue">{String(surfaceHue)}</span>
      <span data-testid="accent-hue">{String(accentHue)}</span>
      <button type="button" onClick={toggleColorScheme}>
        Toggle scheme
      </button>
      <button type="button" onClick={toggleVisualStyle}>
        Toggle style
      </button>
      <button type="button" onClick={() => setSurfaceChroma(0.4)}>
        Saturate surface
      </button>
      <button type="button" onClick={() => setSurfaceChroma(null)}>
        Reset surface saturation
      </button>
      <button type="button" onClick={() => setSurfaceHue(120)}>
        Rotate surface
      </button>
      <button type="button" onClick={() => setSurfaceHue(null)}>
        Reset surface hue
      </button>
      <button type="button" onClick={() => setAccentHue(249)}>
        Rotate accent
      </button>
    </div>
  );
}

function ensureThemeMeta() {
  let meta = document.getElementById(THEME_META_ID) as HTMLMetaElement | null;

  if (!meta) {
    meta = document.createElement("meta");
    meta.id = THEME_META_ID;
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }

  return meta;
}

/** Storage traffic the provider's guarantees are stated in terms of. */
type MockStorage = {
  readonly reads: string[];
  readonly writes: Array<[string, string]>;
  readonly removals: string[];
  forgetTraffic(): void;
};

/**
 * Storage that records the keys it is asked for and the writes it takes, because several of
 * this provider's guarantees are about traffic rather than end state: a locked axis must
 * never touch its keys, a server default must never be written over a saved preference, and
 * the legacy colourway keys must be removed exactly on migration.
 */
function installMockStorage(): MockStorage {
  const store = new Map<string, string>();
  const reads: string[] = [];
  const writes: Array<[string, string]> = [];
  const removals: string[] = [];

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => {
        reads.push(key);
        return store.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        writes.push([key, String(value)]);
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        removals.push(key);
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  });

  return {
    reads,
    writes,
    removals,
    forgetTraffic() {
      reads.length = 0;
      writes.length = 0;
      removals.length = 0;
    },
  };
}

let storage: MockStorage;

/** dose.wiki's policy, stated explicitly so the suite reads the same under either build. */
function renderProvider(
  overrides: {
    initialColorScheme?: ColorScheme;
    initialVisualStyle?: VisualStyle;
    isVisualStyleLocked?: boolean;
    isAccentLocked?: boolean;
    isSurfaceLocked?: boolean;
  } = {},
) {
  return render(
    <ThemeProvider
      initialColorScheme="dark"
      initialVisualStyle="fun"
      isVisualStyleLocked={false}
      isAccentLocked={false}
      isSurfaceLocked={false}
      {...overrides}
    >
      <AppearanceProbe />
    </ThemeProvider>,
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    storage = installMockStorage();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-visual-style");
    document.documentElement.style.colorScheme = "";
    ensureThemeMeta().content = "";
  });

  it("defaults to the ambient publication's appearance policy", () => {
    render(
      <ThemeProvider>
        <AppearanceProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("color-scheme")).toHaveTextContent(
      SITE_FLAVOR_CONFIG.defaultColorScheme,
    );
    expect(screen.getByTestId("visual-style")).toHaveTextContent(
      SITE_FLAVOR_CONFIG.defaultVisualStyle,
    );
    expect(screen.getByTestId("style-locked")).toHaveTextContent(
      String(!SITE_FLAVOR_CONFIG.showVisualStyleToggle),
    );
  });

  it("opens on the appearance the server rendered and applies both axes", async () => {
    renderProvider();

    expect(screen.getByTestId("color-scheme")).toHaveTextContent("dark");
    expect(screen.getByTestId("visual-style")).toHaveTextContent("fun");

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(document.documentElement.dataset.visualStyle).toBe("fun");
      expect(document.documentElement.style.colorScheme).toBe("dark");
      expect(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe("dark");
      expect(window.localStorage.getItem(VISUAL_STYLE_STORAGE_KEY)).toBe("fun");
      expect(ensureThemeMeta().content).toBe(APPEARANCE_META_COLORS.fun.dark);
    });
  });

  it("falls back per axis for unsupported saved values", async () => {
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, "sepia");
    window.localStorage.setItem(VISUAL_STYLE_STORAGE_KEY, "pro");

    renderProvider();

    await waitFor(() => {
      // The unsupported scheme falls back; the supported style beside it still restores.
      expect(screen.getByTestId("color-scheme")).toHaveTextContent("dark");
      expect(screen.getByTestId("visual-style")).toHaveTextContent("pro");
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(document.documentElement.dataset.visualStyle).toBe("pro");
      expect(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe("dark");
      expect(ensureThemeMeta().content).toBe(APPEARANCE_META_COLORS.pro.dark);
    });
  });

  it("adopts the painted appearance without writing the server default over it", async () => {
    // Exactly the state the pre-paint bootstrap leaves for a reader who chose light and Pro.
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, "light");
    window.localStorage.setItem(VISUAL_STYLE_STORAGE_KEY, "pro");
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.visualStyle = "pro";
    storage.forgetTraffic();

    renderProvider({ initialColorScheme: "dark", initialVisualStyle: "fun" });

    await waitFor(() => {
      expect(screen.getByTestId("color-scheme")).toHaveTextContent("light");
      expect(screen.getByTestId("visual-style")).toHaveTextContent("pro");
    });

    // The first client render still holds the server's opening guess. Persisting on that
    // render would overwrite a saved preference with a default the reader never chose.
    expect(storage.writes).not.toContainEqual([COLOR_SCHEME_STORAGE_KEY, "dark"]);
    expect(storage.writes).not.toContainEqual([VISUAL_STYLE_STORAGE_KEY, "fun"]);
    expect(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe("light");
    expect(window.localStorage.getItem(VISUAL_STYLE_STORAGE_KEY)).toBe("pro");
  });

  it("toggles each axis independently and persists both", async () => {
    const user = userEvent.setup();

    renderProvider();

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));

    await user.click(screen.getByRole("button", { name: "Toggle style" }));

    await waitFor(() => {
      expect(screen.getByTestId("visual-style")).toHaveTextContent("pro");
      // The scheme did not move with it: the axes are independent preferences.
      expect(screen.getByTestId("color-scheme")).toHaveTextContent("dark");
      expect(document.documentElement.dataset.visualStyle).toBe("pro");
      expect(window.localStorage.getItem(VISUAL_STYLE_STORAGE_KEY)).toBe("pro");
      expect(ensureThemeMeta().content).toBe(
        getAppearanceMetaColor({ colorScheme: "dark", visualStyle: "pro" }),
      );
    });

    await user.click(screen.getByRole("button", { name: "Toggle scheme" }));

    await waitFor(() => {
      expect(screen.getByTestId("color-scheme")).toHaveTextContent("light");
      expect(screen.getByTestId("visual-style")).toHaveTextContent("pro");
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(document.documentElement.style.colorScheme).toBe("light");
      expect(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe("light");
      expect(ensureThemeMeta().content).toBe(
        getAppearanceMetaColor({ colorScheme: "light", visualStyle: "pro" }),
      );
    });
  });

  it("never reads or writes the style key while the style is locked", async () => {
    const user = userEvent.setup();
    // A Fun preference saved on the other publication, and the painted Pro identity here.
    window.localStorage.setItem(VISUAL_STYLE_STORAGE_KEY, "fun");
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, "dark");
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.visualStyle = "pro";
    storage.forgetTraffic();

    renderProvider({
      initialColorScheme: "light",
      initialVisualStyle: "pro",
      isVisualStyleLocked: true,
    });

    await waitFor(() => expect(screen.getByTestId("color-scheme")).toHaveTextContent("dark"));

    await user.click(screen.getByRole("button", { name: "Toggle style" }));

    expect(screen.getByTestId("style-locked")).toHaveTextContent("true");
    expect(screen.getByTestId("visual-style")).toHaveTextContent("pro");
    expect(storage.reads).not.toContain(VISUAL_STYLE_STORAGE_KEY);
    expect(storage.writes.map(([key]) => key)).not.toContain(VISUAL_STYLE_STORAGE_KEY);
    expect(window.localStorage.getItem(VISUAL_STYLE_STORAGE_KEY)).toBe("fun");
    // The lock is on one axis only: day and night stay a reader preference here.
    expect(document.documentElement.dataset.visualStyle).toBe("pro");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(ensureThemeMeta().content).toBe(APPEARANCE_META_COLORS.pro.dark);
  });

  it("hydrates the site-default levels and hues without ever writing them to storage", async () => {
    renderProvider();

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));

    // The effective level is the default, exposed as a number — the sliders park on it —
    // and the document engages the axis, matching the frame the bootstrap painted. The
    // hue is exposed as null itself: "never chose" is part of the hue interface.
    expect(screen.getByTestId("surface-chroma")).toHaveTextContent(String(DEFAULT_SURFACE_LEVEL));
    expect(screen.getByTestId("accent-chroma")).toHaveTextContent(String(DEFAULT_ACCENT_LEVEL));
    expect(screen.getByTestId("surface-hue")).toHaveTextContent("null");
    expect(screen.getByTestId("accent-hue")).toHaveTextContent("null");
    expect(document.documentElement.dataset.chroma).toBe("");

    // But a default is never persisted: absence of the key IS the default, so a future
    // default change reaches every reader who never moved a slider.
    const writtenKeys = storage.writes.map(([key]) => key);
    expect(writtenKeys).not.toContain(SURFACE_CHROMA_STORAGE_KEY);
    expect(writtenKeys).not.toContain(ACCENT_CHROMA_STORAGE_KEY);
    expect(writtenKeys).not.toContain(SURFACE_HUE_STORAGE_KEY);
    expect(writtenKeys).not.toContain(ACCENT_HUE_STORAGE_KEY);
    expect(window.localStorage.getItem(SURFACE_HUE_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(ACCENT_HUE_STORAGE_KEY)).toBeNull();
  });

  it("restores a saved level over the default, and null resets to the default", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(SURFACE_CHROMA_STORAGE_KEY, "0.4");
    storage.forgetTraffic();

    renderProvider();

    // The saved decimal wins over the default; the untouched axis stays on its default.
    await waitFor(() => {
      expect(screen.getByTestId("surface-chroma")).toHaveTextContent("0.4");
    });
    expect(screen.getByTestId("accent-chroma")).toHaveTextContent(String(DEFAULT_ACCENT_LEVEL));

    await user.click(screen.getByRole("button", { name: "Saturate surface" }));

    await waitFor(() => {
      expect(window.localStorage.getItem(SURFACE_CHROMA_STORAGE_KEY)).toBe("0.4");
    });

    // Null means "back to the default level": the key is removed, not written as the
    // default's current value, and the exposed level returns to the default.
    await user.click(screen.getByRole("button", { name: "Reset surface saturation" }));

    await waitFor(() => {
      expect(screen.getByTestId("surface-chroma")).toHaveTextContent(
        String(DEFAULT_SURFACE_LEVEL),
      );
      expect(window.localStorage.getItem(SURFACE_CHROMA_STORAGE_KEY)).toBeNull();
    });
  });

  it("persists a picked hue as integer degrees, and null removes the key", async () => {
    const user = userEvent.setup();

    renderProvider();

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));

    await user.click(screen.getByRole("button", { name: "Rotate surface" }));

    await waitFor(() => {
      expect(screen.getByTestId("surface-hue")).toHaveTextContent("120");
      expect(window.localStorage.getItem(SURFACE_HUE_STORAGE_KEY)).toBe("120");
    });
    // The axes are independent: rotating the surface moved nothing else.
    expect(screen.getByTestId("accent-hue")).toHaveTextContent("null");
    expect(window.localStorage.getItem(ACCENT_HUE_STORAGE_KEY)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Rotate accent" }));

    await waitFor(() => {
      expect(screen.getByTestId("accent-hue")).toHaveTextContent("249");
      expect(window.localStorage.getItem(ACCENT_HUE_STORAGE_KEY)).toBe("249");
    });

    // Null means "back to the site default": the key is removed, never written as 0.
    await user.click(screen.getByRole("button", { name: "Reset surface hue" }));

    await waitFor(() => {
      expect(screen.getByTestId("surface-hue")).toHaveTextContent("null");
      expect(window.localStorage.getItem(SURFACE_HUE_STORAGE_KEY)).toBeNull();
    });
  });

  it("restores a saved hue over a lingering legacy id, and still retires the id", async () => {
    // A reader who migrated already (or chose a hue) while an old colourway id lingers.
    window.localStorage.setItem(SURFACE_HUE_STORAGE_KEY, "40");
    window.localStorage.setItem(SURFACE_STORAGE_KEY, "abyss");
    storage.forgetTraffic();

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId("surface-hue")).toHaveTextContent("40");
    });
    expect(storage.removals).toContain(SURFACE_STORAGE_KEY);
    expect(window.localStorage.getItem(SURFACE_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(SURFACE_HUE_STORAGE_KEY)).toBe("40");
  });

  it("translates the legacy colourway keys into hue coordinates and removes them", async () => {
    // What the discrete-swatch era left behind for a reader who wore Abyss and Teal.
    window.localStorage.setItem(SURFACE_STORAGE_KEY, "abyss");
    window.localStorage.setItem(ACCENT_STORAGE_KEY, "teal");
    storage.forgetTraffic();

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId("surface-hue")).toHaveTextContent(
        String(LEGACY_SURFACE_TO_HUE.abyss.hue),
      );
      expect(screen.getByTestId("accent-hue")).toHaveTextContent(
        String(LEGACY_ACCENT_TO_HUE.teal.hue),
      );
    });

    // The translation is persisted and the old keys are gone: the migration runs once.
    await waitFor(() => {
      expect(window.localStorage.getItem(SURFACE_HUE_STORAGE_KEY)).toBe(
        String(LEGACY_SURFACE_TO_HUE.abyss.hue),
      );
      expect(window.localStorage.getItem(ACCENT_HUE_STORAGE_KEY)).toBe(
        String(LEGACY_ACCENT_TO_HUE.teal.hue),
      );
      expect(window.localStorage.getItem(SURFACE_STORAGE_KEY)).toBeNull();
      expect(window.localStorage.getItem(ACCENT_STORAGE_KEY)).toBeNull();
    });
  });

  it("maps the retired achromatic ids to saturation 0, overriding a stored level", async () => {
    // Graphite/Neutral were "grey", which is now just saturation 0: the stored level —
    // saved back when the reader wore a chromatic colourway — must not resurrect colour.
    window.localStorage.setItem(SURFACE_STORAGE_KEY, "graphite");
    window.localStorage.setItem(SURFACE_CHROMA_STORAGE_KEY, "0.8");
    window.localStorage.setItem(ACCENT_STORAGE_KEY, "neutral");
    storage.forgetTraffic();

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId("surface-hue")).toHaveTextContent("0");
      expect(screen.getByTestId("surface-chroma")).toHaveTextContent("0");
      expect(screen.getByTestId("accent-chroma")).toHaveTextContent("0");
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(SURFACE_CHROMA_STORAGE_KEY)).toBe("0");
      expect(window.localStorage.getItem(ACCENT_CHROMA_STORAGE_KEY)).toBe("0");
      expect(window.localStorage.getItem(SURFACE_STORAGE_KEY)).toBeNull();
      expect(window.localStorage.getItem(ACCENT_STORAGE_KEY)).toBeNull();
    });
  });

  it("never touches the colour keys while both colour axes are locked", async () => {
    // Effect Index: a dose.wiki reader's saved coordinates and un-migrated ids must
    // survive a visit untouched — neither read, nor migrated, nor removed.
    window.localStorage.setItem(SURFACE_STORAGE_KEY, "abyss");
    window.localStorage.setItem(ACCENT_STORAGE_KEY, "teal");
    window.localStorage.setItem(SURFACE_HUE_STORAGE_KEY, "40");
    storage.forgetTraffic();

    renderProvider({ isSurfaceLocked: true, isAccentLocked: true });

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));

    for (const key of [
      SURFACE_STORAGE_KEY,
      ACCENT_STORAGE_KEY,
      SURFACE_HUE_STORAGE_KEY,
      ACCENT_HUE_STORAGE_KEY,
      SURFACE_CHROMA_STORAGE_KEY,
      ACCENT_CHROMA_STORAGE_KEY,
    ]) {
      expect(storage.reads).not.toContain(key);
      expect(storage.writes.map(([written]) => written)).not.toContain(key);
      expect(storage.removals).not.toContain(key);
    }
    expect(window.localStorage.getItem(SURFACE_STORAGE_KEY)).toBe("abyss");
    expect(window.localStorage.getItem(SURFACE_HUE_STORAGE_KEY)).toBe("40");
    // Both colour axes null disengages the axis attribute entirely: the page renders
    // the authored palette, exactly what a locked publication wants.
    expect(document.documentElement.dataset.chroma).toBeUndefined();
  });
});
