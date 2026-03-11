import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  THEME_META_ID,
  THEME_STORAGE_KEY,
  ThemeProvider,
  useTheme,
} from "./ThemeContext";

function ThemeProbe() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button type="button" onClick={toggleTheme}>
        Toggle theme
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

function installMockStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });

  return storage;
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    installMockStorage();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
    ensureThemeMeta().content = "";
  });

  it("defaults to dark when there is no saved theme", async () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-value")).toHaveTextContent("dark");

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
      expect(ensureThemeMeta().content).toBe("#0f0a1f");
    });
  });

  it("falls back to dark for invalid saved values", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("theme-value")).toHaveTextContent("dark");
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    });
  });

  it("starts in light mode when a saved light preference exists", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("theme-value")).toHaveTextContent("light");
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(document.documentElement.style.colorScheme).toBe("light");
      expect(ensureThemeMeta().content).toBe("#f6efff");
    });
  });

  it("toggles theme and persists the new value", async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Toggle theme" }));

    await waitFor(() => {
      expect(screen.getByTestId("theme-value")).toHaveTextContent("light");
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
      expect(ensureThemeMeta().content).toBe("#f6efff");
    });
  });
});
