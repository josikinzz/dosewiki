import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceTestProvider } from "@/test/AppearanceTestProvider";
import { ColorField } from "./ColorField";
import { ThemeLabLazy as ThemeLab } from "./ThemeLabLazy";
import { setThemeLabOpen } from "./themeLabStore";
import { DEFAULT_LOOK, lookKey } from "./themeLabLook";
import { clearThemeBaselineCache } from "./presetBaselines";
import styles from "./ThemeLab.module.css";

/** Spelled out rather than imported so a rename of the constant cannot quietly
 *  move readers' persisted data: this literal is the shipped contract. */
const STORAGE_KEY = "dosewiki-palette-lab";

/** The look `AppearanceTestProvider` opens on: the style pinned to Fun. Edits are
 *  keyed by look, so an assertion about the envelope has to name the look the
 *  panel was editing. */
const OPEN_LOOK = lookKey(DEFAULT_LOOK);

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

function installStyle(css: string) {
  const style = document.createElement("style");
  style.setAttribute("data-theme-lab-test-style", "");
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}

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

async function openPanel() {
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

function jsonBox(panel: HTMLElement) {
  return within(panel).getByRole("textbox", { name: /Theme colors JSON/ }) as HTMLTextAreaElement;
}

// The JSON console lives in the collapsed-by-default "Advanced" drawer; open it
// before reaching for the JSON textbox / Apply button.
async function openAdvanced(panel: HTMLElement) {
  const toggle = within(panel).getByRole("button", { name: /Advanced/ });
  if (toggle.getAttribute("aria-expanded") !== "true") {
    await userEvent.click(toggle);
  }
}

// The theme gallery is the default view; catalog tests switch to the depth they
// need. Nothing is auto-selected in any of them — the editor stays collapsed
// until a swatch is picked.
async function switchToSections(panel: HTMLElement) {
  await userEvent.click(within(panel).getByRole("button", { name: /All colors/ }));
}

async function switchToEssentials(panel: HTMLElement) {
  await userEvent.click(within(panel).getByRole("button", { name: /Essentials/ }));
}

function searchInput(panel: HTMLElement) {
  return within(panel).getByPlaceholderText("Filter colors…") as HTMLInputElement;
}

describe("ThemeLab", { timeout: 15_000 }, () => {
  it("lists the essentials once that view is chosen", async () => {
    const panel = await openPanel();
    await switchToEssentials(panel);
    expect(within(panel).getByRole("button", { name: /Essentials/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(panel).getByRole("button", { name: /Page background/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Page gradient — top/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Page gradient — middle/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Page gradient — bottom/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Panel gradient — highlight/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Panel gradient — primary/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Panel gradient — secondary/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Chips & buttons — highlight/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Active tabs — primary/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Logo start/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Logo glow/ })).toBeInTheDocument();
    expect(within(panel).getByText("Interaction cards")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Highest risk — primary/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Highest risk — secondary/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Avoid — primary/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Avoid — secondary/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Use caution — primary/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Use caution — secondary/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Info panel — primary/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Top bar — primary/ })).toBeInTheDocument();
  });

  it("offers editable colors from every stacked element under a picker click", async () => {
    installStyle(`
      .picker-top-text {
        color: var(--theme-text-primary);
      }

      .picker-under-panel {
        background: var(--theme-frosted-panel-bg);
      }
    `);
    const underPanel = document.createElement("div");
    underPanel.className = "picker-under-panel";
    const topText = document.createElement("span");
    topText.className = "picker-top-text";
    topText.textContent = "Stacked label";
    document.body.append(underPanel, topText);
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: vi.fn(() => [topText, underPanel, document.body, document.documentElement]),
    });
    vi.spyOn(topText, "getBoundingClientRect").mockReturnValue({
      x: 20,
      y: 30,
      left: 20,
      top: 30,
      right: 120,
      bottom: 50,
      width: 100,
      height: 20,
      toJSON: () => ({}),
    });
    const panel = await openPanel();

    await userEvent.click(within(panel).getByRole("button", { name: /Pick a color from the page/ }));
    fireEvent.click(document.body, { clientX: 24, clientY: 34 });

    const menu = await screen.findByRole("menu", { name: "Edit which color" });
    expect(within(menu).getByRole("menuitem", { name: /TextHeading text/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /BackgroundPanel gradient — highlight/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /BackgroundPanel gradient — primary/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /BackgroundPanel gradient — secondary/ })).toBeInTheDocument();
  });

  it("applies a stacked picker menu item instead of picking the page below it", async () => {
    installStyle(`
      .picker-top-text {
        color: var(--theme-text-primary);
      }

      .picker-under-panel {
        background: var(--theme-frosted-panel-bg);
      }
    `);
    const underPanel = document.createElement("div");
    underPanel.className = "picker-under-panel";
    const topText = document.createElement("span");
    topText.className = "picker-top-text";
    topText.textContent = "Stacked label";
    document.body.append(underPanel, topText);
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: vi.fn(() => [topText, underPanel, document.body, document.documentElement]),
    });
    const panel = await openPanel();

    await userEvent.click(within(panel).getByRole("button", { name: /Pick a color from the page/ }));
    fireEvent.click(document.body, { clientX: 24, clientY: 34 });
    const menu = await screen.findByRole("menu", { name: "Edit which color" });

    await userEvent.click(within(menu).getByRole("menuitem", { name: /BackgroundPanel gradient — primary/ }));

    expect(screen.queryByRole("menu", { name: "Edit which color" })).not.toBeInTheDocument();
    expect(within(panel).getAllByText("Panel gradient — primary").length).toBeGreaterThan(0);
  });

  it("opens and shows major groups expanded, secondary collapsed (sections view)", async () => {
    const panel = await openPanel();
    await switchToSections(panel);

    expect(within(panel).getByRole("button", { name: /Primary — headings/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Accent — base/ })).toBeInTheDocument();

    // A secondary group (JSON syntax) is collapsed, so its rows are absent.
    expect(within(panel).queryByRole("button", { name: /^String/ })).not.toBeInTheDocument();
  });

  it("shows an empty state when an Essentials search has no matches", async () => {
    const panel = await openPanel();
    await switchToEssentials(panel);

    await userEvent.type(searchInput(panel), "zzzz-no-color");

    expect(within(panel).getByText("No colors match your search.")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /Page background/ })).not.toBeInTheDocument();
  });

  it("shows and edits the dosage duration panel background in Essentials", async () => {
    const panel = await openPanel();
    await switchToEssentials(panel);

    await userEvent.click(
      within(panel).getByRole("button", { name: /Dosage\/duration panel background/ }),
    );

    expect(within(panel).getAllByText("Dosage/duration panel background").length).toBeGreaterThan(0);

    fireEvent.change(within(panel).getByRole("textbox", { name: /Hex/ }), {
      target: { value: "#654321" },
    });

    await openAdvanced(panel);
    await waitFor(() => {
      expect(jsonBox(panel).value).toContain('"--theme-article-neutral-panel-base": "#654321"');
    });
    expect(document.getElementById("theme-lab-overrides")?.textContent).toContain(
      "--theme-article-neutral-panel-base:#654321",
    );
  });

  it("shows an empty state when an All colors search has no matches", async () => {
    const panel = await openPanel();
    await switchToSections(panel);

    await userEvent.type(searchInput(panel), "zzzz-no-color");

    expect(within(panel).getByText("No colors match your search.")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /Primary — headings/ })).not.toBeInTheDocument();
  });

  it("edits a color via the hex field and reflects it in the JSON and the override style", async () => {
    const panel = await openPanel();
    await switchToSections(panel);

    await userEvent.click(within(panel).getByRole("button", { name: /Primary — headings/ }));

    expect(within(panel).getByText("--theme-text-primary")).toBeInTheDocument();
    expect(within(panel).getByRole("slider", { name: "Hue" })).toBeInTheDocument();

    const hexInput = within(panel).getByRole("textbox", { name: /Hex/ });
    fireEvent.change(hexInput, { target: { value: "#123456" } });

    await openAdvanced(panel);
    await waitFor(() => {
      expect(jsonBox(panel).value).toContain('"--theme-text-primary": "#123456"');
    });

    const styleEl = document.getElementById("theme-lab-overrides");
    expect(styleEl?.textContent).toContain('html[data-theme="dark"]');
    expect(styleEl?.textContent).toContain("--theme-text-primary:#123456");
  });

  it("edits a primitive channel seed and writes it back as an `R G B` triple", async () => {
    const panel = await openPanel();
    await switchToSections(panel);

    await userEvent.click(within(panel).getByRole("button", { name: /Brand magenta/ }));
    expect(within(panel).getByText("--c-brand")).toBeInTheDocument();

    const hexInput = within(panel).getByRole("textbox", { name: /Hex/ });
    fireEvent.change(hexInput, { target: { value: "#d946ef" } });

    await openAdvanced(panel);
    await waitFor(() => {
      expect(jsonBox(panel).value).toContain('"--c-brand": "217 70 239"');
    });
    expect(document.getElementById("theme-lab-overrides")?.textContent).toContain(
      "--c-brand:217 70 239",
    );
  });

  it("preserves current alpha when a six-digit hex is entered", () => {
    const onChange = vi.fn();
    render(<ColorField initial={{ r: 255, g: 255, b: 255, a: 0.1 }} onChange={onChange} />);

    fireEvent.change(screen.getByRole("textbox", { name: /Hex/ }), {
      target: { value: "#445566" },
    });

    expect(onChange).toHaveBeenLastCalledWith({ r: 68, g: 85, b: 102, a: 0.1 });
  });

  it("applies alpha when an eight-digit hex is entered", () => {
    const onChange = vi.fn();
    render(<ColorField initial={{ r: 255, g: 255, b: 255, a: 0.1 }} onChange={onChange} />);

    fireEvent.change(screen.getByRole("textbox", { name: /Hex/ }), {
      target: { value: "#44556680" },
    });

    expect(onChange).toHaveBeenLastCalledWith({ r: 68, g: 85, b: 102, a: 0.502 });
  });

  it("edits a color via pointer drag without updating ThemeLab during ColorField render", async () => {
    const panel = await openPanel();
    await switchToSections(panel);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await userEvent.click(within(panel).getByRole("button", { name: /Primary — headings/ }));
    const svSquare = panel.querySelector(`.${styles.svSquare}`) as HTMLDivElement | null;
    expect(svSquare).toBeInTheDocument();
    vi.spyOn(svSquare!, "getBoundingClientRect").mockReturnValue({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 110,
      bottom: 120,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(svSquare!, { clientX: 60, clientY: 70, pointerId: 1 });

    await openAdvanced(panel);
    await waitFor(() => {
      expect(jsonBox(panel).value).toContain("--theme-text-primary");
    });
    expect(
      consoleError.mock.calls.some(([message]) =>
        String(message).includes("Cannot update a component"),
      ),
    ).toBe(false);
    consoleError.mockRestore();
  });

  it("imports a pasted JSON object via the single JSON box", async () => {
    const panel = await openPanel();
    await openAdvanced(panel);

    fireEvent.change(jsonBox(panel), {
      target: { value: JSON.stringify({ dark: { "--theme-accent": "#ff00aa" }, light: {} }) },
    });
    await userEvent.click(within(panel).getByRole("button", { name: /Apply JSON/ }));

    await waitFor(() => {
      expect(jsonBox(panel).value).toContain('"--theme-accent": "#ff00aa"');
    });
    expect(document.getElementById("theme-lab-overrides")?.textContent).toContain(
      "--theme-accent:#ff00aa",
    );
  });

  it("rejects invalid JSON on apply", async () => {
    const panel = await openPanel();
    await openAdvanced(panel);

    fireEvent.change(jsonBox(panel), { target: { value: "not json" } });
    await userEvent.click(within(panel).getByRole("button", { name: /Apply JSON/ }));

    expect(within(panel).getByText(/isn't valid JSON/)).toBeInTheDocument();
  });

  it("persists overrides to localStorage", async () => {
    const panel = await openPanel();
    await switchToSections(panel);
    await userEvent.click(within(panel).getByRole("button", { name: /Accent — base/ }));
    fireEvent.change(within(panel).getByRole("textbox", { name: /Hex/ }), {
      target: { value: "#abcdef" },
    });

    await waitFor(() => {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      expect(stored).toContain("--theme-accent");
      expect(stored).toContain("#abcdef");
    });
  });

  it("toggles between merged and sections views", async () => {
    const panel = await openPanel();
    expect(within(panel).getByRole("button", { name: /Essentials/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await switchToSections(panel);
    expect(within(panel).getByRole("button", { name: /Primary — headings/ })).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole("button", { name: /Identical/ }));
    expect(within(panel).getByRole("button", { name: /Identical/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(panel).getByText(/No colors match your search/)).toBeInTheDocument();
  });

  it("closes on Escape and hands focus back to the action that opened it", async () => {
    await openPanel();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Theme Lab" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Open Theme Lab/i })).toHaveFocus();
  });

  describe("persisted edits", () => {
    it("files a panel edit under the look it was made on", async () => {
      const panel = await openPanel();
      await switchToSections(panel);
      await userEvent.click(within(panel).getByRole("button", { name: /Accent — base/ }));
      fireEvent.change(within(panel).getByRole("textbox", { name: /Hex/ }), {
        target: { value: "#fedcba" },
      });

      await waitFor(() => {
        const raw = window.localStorage.getItem(STORAGE_KEY) ?? "";
        expect(raw).toContain('"version":5');
        // Not a global overlay: the edit is a statement about this visual
        // style, so flipping the style leaves it behind.
        expect(JSON.parse(raw).editsByLook[OPEN_LOOK].dark["--theme-accent"]).toBe("#fedcba");
      });
    });

    it("resets to what the site's own stylesheets resolve, leaving no layer behind", async () => {
      const panel = await openPanel();
      await switchToSections(panel);
      await userEvent.click(within(panel).getByRole("button", { name: /Primary — headings/ }));
      fireEvent.change(within(panel).getByRole("textbox", { name: /Hex/ }), {
        target: { value: "#fedcba" },
      });
      expect(document.getElementById("theme-lab-overrides")?.textContent ?? "").toContain(
        "--theme-text-primary:#fedcba",
      );

      await openAdvanced(panel);
      await userEvent.click(within(panel).getByRole("button", { name: /Reset all themes/ }));

      // Nothing is injected at all: the lab has no base layer of its own to fall
      // back to, so an empty edit map means the page renders exactly what the
      // style, scheme and chroma stylesheets say.
      expect(document.getElementById("theme-lab-overrides")?.textContent ?? "").toBe("");
      await waitFor(() => {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        // Two honest shapes, depending on whether the edit's debounced write had
        // already landed when the reset superseded it: an envelope with no looks
        // in it, or no envelope at all because nothing was ever worth writing.
        // Both say the same thing to the reader — nothing is saved.
        expect(raw === null ? {} : JSON.parse(raw).editsByLook).toEqual({});
      });
    });
  });
});
