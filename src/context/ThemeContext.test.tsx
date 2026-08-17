import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { APPEARANCE_META_COLORS, getAppearanceMetaColor } from "@/theme";
import {
  COLOR_SCHEME_STORAGE_KEY,
  THEME_META_ID,
  VISUAL_STYLE_STORAGE_KEY,
  ThemeProvider,
  useTheme,
  type ColorScheme,
  type VisualStyle,
} from "./ThemeContext";

function AppearanceProbe() {
  const { colorScheme, visualStyle, isVisualStyleLocked, toggleColorScheme, toggleVisualStyle } =
    useTheme();

  return (
    <div>
      <span data-testid="color-scheme">{colorScheme}</span>
      <span data-testid="visual-style">{visualStyle}</span>
      <span data-testid="style-locked">{String(isVisualStyleLocked)}</span>
      <button type="button" onClick={toggleColorScheme}>
        Toggle scheme
      </button>
      <button type="button" onClick={toggleVisualStyle}>
        Toggle style
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
  forgetTraffic(): void;
};

/**
 * Storage that records the keys it is asked for and the writes it takes, because two of this
 * provider's guarantees are about traffic rather than end state: a locked axis must never
 * touch its key, and a server default must never be written over a saved preference.
 */
function installMockStorage(): MockStorage {
  const store = new Map<string, string>();
  const reads: string[] = [];
  const writes: Array<[string, string]> = [];

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
    forgetTraffic() {
      reads.length = 0;
      writes.length = 0;
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
  } = {},
) {
  return render(
    <ThemeProvider
      initialColorScheme="dark"
      initialVisualStyle="fun"
      isVisualStyleLocked={false}
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
});
