import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Footer } from "./Footer";
import {
  THEME_STORAGE_KEY,
  ThemeProvider,
} from "../../context/ThemeContext";

vi.mock("../common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-testid="icon">{icon}</span>,
}));

vi.mock("../../assets/dosewiki-logo.svg?inline", () => ({
  default: "logo-data-uri",
}));

function renderFooter() {
  return render(
    <ThemeProvider>
      <Footer />
    </ThemeProvider>,
  );
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

describe("Footer theme toggle", () => {
  beforeEach(() => {
    installMockStorage();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("is-safari");
  });

  it("toggles to light mode and persists across remounts", async () => {
    const user = userEvent.setup();
    const firstRender = renderFooter();

    const toggle = screen.getByRole("button", { name: "Switch to light mode" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
      expect(screen.getByRole("button", { name: "Switch to dark mode" })).toHaveAttribute("aria-pressed", "true");
    });

    firstRender.unmount();
    renderFooter();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Switch to dark mode" })).toHaveAttribute("aria-pressed", "true");
      expect(document.documentElement.dataset.theme).toBe("light");
    });
  });

  it("renders the updated footer copy and action buttons", () => {
    renderFooter();

    expect(screen.queryByText("Harm reduction reference")).not.toBeInTheDocument();
    expect(screen.getByText(/Community harm-reduction information\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CC BY-SA 4.0 license" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by-sa/4.0/",
    );
    expect(screen.getByRole("link", { name: /About/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dev tools" })).toHaveAttribute("href", "/dev");
    expect(screen.getByRole("link", { name: "dose.wiki GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/dose-wiki/dose.wiki",
    );
  });
});
