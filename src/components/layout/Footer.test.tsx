import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRouteChromeModel } from "@/utils/routeChrome";
import { Footer } from "./Footer";
import {
  THEME_STORAGE_KEY,
  ThemeProvider,
} from "../../context/ThemeContext";

vi.mock("../common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-testid="icon">{icon}</span>,
}));

vi.mock("@/components/dev/PaletteLab", () => ({
  PaletteLab: () => <button type="button" aria-label="Open Palette Lab" />,
}));

vi.mock("../../assets/dosewiki-logo.svg", () => ({
  default: "/mock-dosewiki-logo.svg",
}));

function renderFooter() {
  return render(
    <ThemeProvider>
      <Footer model={getRouteChromeModel("/dev/profile")} />
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
    expect(screen.getByRole("link", { name: "License & reuse" })).toHaveAttribute(
      "href",
      "/docs/license",
    );
    expect(screen.queryByRole("link", { name: /About/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dev tools" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "dose.wiki GitHub" })).not.toBeInTheDocument();
  });
});
