import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, vi } from "vitest";
import { AppearanceTestProvider } from "@/test/AppearanceTestProvider";
import { ThemeLabLazy as ThemeLab } from "./ThemeLabLazy";
import { setThemeLabOpen } from "./themeLabStore";
import { DEFAULT_LOOK, lookKey } from "./themeLabLook";
import { clearThemeBaselineCache } from "./presetBaselines";

/** Spelled out rather than imported so a rename of the constant cannot quietly
 *  move readers' persisted data: this literal is the shipped contract. */
export const STORAGE_KEY = "dosewiki-palette-lab";

/** The look `AppearanceTestProvider` opens on: the style pinned to Fun. Edits are
 *  keyed by look, so an assertion about the envelope has to name the look the
 *  panel was editing. */
export const OPEN_LOOK = lookKey(DEFAULT_LOOK);

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

function installMockStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
  });
}

export function installStyle(css: string) {
  const style = document.createElement("style");
  style.setAttribute("data-theme-lab-test-style", "");
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}

export function installThemeLabTestHarness() {
  beforeEach(() => {
    installMockStorage();
    document.documentElement.setAttribute("data-theme", "dark");
    document.head.querySelectorAll("[data-theme-lab-test-style]").forEach((node) => node.remove());
    document.getElementById("theme-lab-overrides")?.remove();
    clearThemeBaselineCache();
    // Reset the shared open store between tests (it is module-level state).
    setThemeLabOpen(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.head.querySelectorAll("[data-theme-lab-test-style]").forEach((node) => node.remove());
    document.getElementById("theme-lab-overrides")?.remove();
  });
}

export async function openPanel() {
  // Appearance controls own the open action and hand the lab the element focus
  // should return to on close. This button stands in for that public action.
  render(
    <>
      <button type="button">Open Theme Lab</button>
      <AppearanceTestProvider><ThemeLab /></AppearanceTestProvider>
    </>,
  );
  act(() => setThemeLabOpen(true, screen.getByRole("button", { name: "Open Theme Lab" })));
  return screen.findByRole("dialog", { name: "Theme Lab" });
}

export function jsonBox(panel: HTMLElement) {
  return within(panel).getByRole("textbox", { name: /Theme colors JSON/ }) as HTMLTextAreaElement;
}

// The JSON console lives in the collapsed-by-default "Advanced" drawer; open it
// before reaching for the JSON textbox / Apply button.
export async function openAdvanced(panel: HTMLElement) {
  const toggle = within(panel).getByRole("button", { name: /Advanced/ });
  if (toggle.getAttribute("aria-expanded") !== "true") {
    await userEvent.click(toggle);
  }
}

// The theme gallery is the default view; catalog tests switch to the depth they
// need. Nothing is auto-selected in any of them — the editor stays collapsed
// until a swatch is picked.
export async function switchToSections(panel: HTMLElement) {
  await userEvent.click(within(panel).getByRole("button", { name: /All colors/ }));
}

export async function switchToEssentials(panel: HTMLElement) {
  await userEvent.click(within(panel).getByRole("button", { name: /Essentials/ }));
}

export function searchInput(panel: HTMLElement) {
  return within(panel).getByPlaceholderText("Filter colors…") as HTMLInputElement;
}
