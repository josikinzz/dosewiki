import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaletteLab } from "./PaletteLab";
import styles from "./PaletteLab.module.css";

const STORAGE_KEY = "dosewiki-palette-lab";

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

beforeEach(() => {
  installMockStorage();
  document.documentElement.setAttribute("data-theme", "dark");
  document.getElementById("palette-lab-overrides")?.remove();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.getElementById("palette-lab-overrides")?.remove();
});

async function openPanel() {
  render(<PaletteLab />);
  const trigger = await screen.findByRole("button", { name: /Open Palette Lab/i });
  await userEvent.click(trigger);
  return screen.getByRole("dialog", { name: "Palette Lab" });
}

function jsonBox(panel: HTMLElement) {
  return within(panel).getByRole("textbox", { name: /Theme colors JSON/ }) as HTMLTextAreaElement;
}

// Essentials is the default view; section-based tests switch to All colors to
// reach the complete token catalog.
async function switchToSections(panel: HTMLElement) {
  await userEvent.click(within(panel).getByRole("button", { name: /All colors/ }));
}

describe("PaletteLab", () => {
  it("defaults to the essentials view", async () => {
    const panel = await openPanel();
    expect(within(panel).getByRole("button", { name: /Essentials/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(panel).getByRole("button", { name: /Page background/ })).toBeInTheDocument();
  });

  it("opens and shows major groups expanded, secondary collapsed (sections view)", async () => {
    const panel = await openPanel();
    await switchToSections(panel);

    expect(within(panel).getByRole("button", { name: /Primary — headings/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Accent — base/ })).toBeInTheDocument();

    // A secondary group (JSON syntax) is collapsed, so its rows are absent.
    expect(within(panel).queryByRole("button", { name: /^String/ })).not.toBeInTheDocument();
  });

  it("edits a color via the hex field and reflects it in the JSON and the override style", async () => {
    const panel = await openPanel();
    await switchToSections(panel);

    await userEvent.click(within(panel).getByRole("button", { name: /Primary — headings/ }));

    expect(within(panel).getByText("--theme-text-primary")).toBeInTheDocument();
    expect(within(panel).getByRole("slider", { name: "Hue" })).toBeInTheDocument();

    const hexInput = within(panel).getByRole("textbox", { name: /Hex/ });
    fireEvent.change(hexInput, { target: { value: "#123456" } });

    await waitFor(() => {
      expect(jsonBox(panel).value).toContain('"--theme-text-primary": "#123456"');
    });

    const styleEl = document.getElementById("palette-lab-overrides");
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

    await waitFor(() => {
      expect(jsonBox(panel).value).toContain('"--c-brand": "217 70 239"');
    });
    expect(document.getElementById("palette-lab-overrides")?.textContent).toContain(
      "--c-brand:217 70 239",
    );
  });

  it("edits a color via pointer drag without updating PaletteLab during ColorWheel render", async () => {
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

    fireEvent.change(jsonBox(panel), {
      target: { value: JSON.stringify({ dark: { "--theme-accent": "#ff00aa" }, light: {} }) },
    });
    await userEvent.click(within(panel).getByRole("button", { name: /Apply JSON/ }));

    await waitFor(() => {
      expect(jsonBox(panel).value).toContain('"--theme-accent": "#ff00aa"');
    });
    expect(document.getElementById("palette-lab-overrides")?.textContent).toContain(
      "--theme-accent:#ff00aa",
    );
  });

  it("rejects invalid JSON on apply", async () => {
    const panel = await openPanel();

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

    await userEvent.click(within(panel).getByRole("button", { name: /Merged/ }));
    expect(within(panel).getByRole("button", { name: /Merged/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(panel).getByText(/No colors match your search/)).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    await openPanel();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Palette Lab" })).not.toBeInTheDocument();
    });
  });
});
