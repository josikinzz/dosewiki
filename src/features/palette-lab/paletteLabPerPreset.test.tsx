import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaletteLabLazy as PaletteLab } from "./PaletteLabLazy";
import { PaletteLabTrigger } from "./PaletteLabTrigger";
import { PALETTE_ATTRIBUTE } from "./paletteLabStorage";
import { setPaletteLabOpen } from "./paletteLabStore";
import { clearThemeBaselineCache } from "./presetBaselines";

/**
 * Per-preset edit isolation, through the same seam as the rest of the lab:
 * *stored envelope in → applied document state out*.
 *
 * These are the cases the v2 envelope could not express — switching palettes
 * used to wipe the visitor's edits (with an undo bar), revert baselines came
 * from the stock look rather than the palette being worn, and an export was an
 * unstamped blob that re-labelled itself as edits on the default palette when
 * pasted back.
 */

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
  document.documentElement.removeAttribute(PALETTE_ATTRIBUTE);
  document.getElementById("palette-lab-overrides")?.remove();
  clearThemeBaselineCache();
  setPaletteLabOpen(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute(PALETTE_ATTRIBUTE);
  document.getElementById("palette-lab-overrides")?.remove();
});

/** Which shipped palette is worn: a preset applies by naming it on the root,
 *  with its tokens compiled into the stylesheet. */
function palette() {
  return document.documentElement.getAttribute(PALETTE_ATTRIBUTE);
}

async function openPanel() {
  render(
    <>
      <PaletteLabTrigger />
      <PaletteLab />
    </>,
  );
  await userEvent.click(await screen.findByRole("button", { name: /Open Palette Lab/i }));
  return screen.findByRole("dialog", { name: "Palette Lab" });
}

function jsonBox(panel: HTMLElement) {
  return within(panel).getByRole("textbox", { name: /Theme colors JSON/ }) as HTMLTextAreaElement;
}

async function openAdvanced(panel: HTMLElement) {
  const toggle = within(panel).getByRole("button", { name: /Advanced/ });
  if (toggle.getAttribute("aria-expanded") !== "true") await userEvent.click(toggle);
}

async function switchToSections(panel: HTMLElement) {
  await userEvent.click(within(panel).getByRole("button", { name: /All colors/ }));
}

describe("Palette Lab per-preset edits", { timeout: 15_000 }, () => {
  it("keeps each palette's own edits when switching away and back, with no undo bar", async () => {
    const panel = await openPanel();
    await switchToSections(panel);

    // Tweak Orchid (A).
    await userEvent.click(within(panel).getByRole("button", { name: /Accent — base/ }));
    fireEvent.change(within(panel).getByRole("textbox", { name: /Hex/ }), {
      target: { value: "#abcdef" },
    });

    // Switch to Twilight (B): navigation, not a destructive apply.
    await userEvent.click(within(panel).getByRole("button", { name: /^Twilight/ }));
    let styleText = document.getElementById("palette-lab-overrides")?.textContent ?? "";
    expect(palette()).toBe("twilight");
    expect(styleText).not.toContain("--theme-accent:#abcdef");
    expect(within(panel).queryByRole("button", { name: /Undo/ })).not.toBeInTheDocument();

    // Tweak Twilight; its edit is its own.
    await userEvent.click(within(panel).getByRole("button", { name: /Accent — base/ }));
    fireEvent.change(within(panel).getByRole("textbox", { name: /Hex/ }), {
      target: { value: "#010203" },
    });

    // Back to Orchid (A): its tweak is intact, Twilight's is not showing.
    await userEvent.click(within(panel).getByRole("button", { name: /^Orchid/ }));
    styleText = document.getElementById("palette-lab-overrides")?.textContent ?? "";
    expect(palette()).toBe("orchid");
    expect(styleText).toContain("--theme-accent:#abcdef");
    expect(styleText).not.toContain("--theme-accent:#010203");

    // Both edit maps survive in storage, filed under the palette they belong to.
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
      expect(stored.editsByPreset.orchid.dark["--theme-accent"]).toBe("#abcdef");
      expect(stored.editsByPreset.twilight.dark["--theme-accent"]).toBe("#010203");
      expect(stored.activeThemeRef).toEqual({ kind: "preset", id: "orchid" });
    });
  });

  it("drops an edit that lands on the active palette's own value, not the stock one", async () => {
    const panel = await openPanel();
    await userEvent.click(within(panel).getByRole("button", { name: /^Abyss/ }));
    await switchToSections(panel);
    await userEvent.click(within(panel).getByRole("button", { name: /Accent — base/ }));

    // Abyss's own accent: typing it means "no divergence", so no edit is kept.
    fireEvent.change(within(panel).getByRole("textbox", { name: /Hex/ }), {
      target: { value: "#a5f3fc" },
    });
    expect(within(panel).getByText("No changes")).toBeInTheDocument();

    // The same value on Orchid *is* a divergence, and is kept.
    await userEvent.click(within(panel).getByRole("button", { name: /^Orchid/ }));
    await userEvent.click(within(panel).getByRole("button", { name: /Accent — base/ }));
    fireEvent.change(within(panel).getByRole("textbox", { name: /Hex/ }), {
      target: { value: "#a5f3fc" },
    });
    expect(within(panel).getByRole("button", { name: /1 changed/ })).toBeInTheDocument();
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
      expect(stored.editsByPreset.abyss).toBeUndefined();
      expect(stored.editsByPreset.orchid.dark["--theme-accent"]).toBe("#a5f3fc");
    });
  });

  it("round-trips a stamped export back onto the same palette with zero edits", async () => {
    const panel = await openPanel();
    await userEvent.click(within(panel).getByRole("button", { name: /^Abyss/ }));
    await openAdvanced(panel);

    const exported = jsonBox(panel).value;
    expect(JSON.parse(exported).theme).toEqual({ kind: "preset", id: "abyss" });

    // Re-applying the export changes nothing: it is a description of Abyss,
    // not a pile of edits on top of it.
    fireEvent.change(jsonBox(panel), { target: { value: exported } });
    await userEvent.click(within(panel).getByRole("button", { name: /Apply JSON/ }));

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
      expect(stored.activeThemeRef).toEqual({ kind: "preset", id: "abyss" });
      expect(stored.editsByPreset).toEqual({});
    });
    expect(within(panel).getByText("No changes")).toBeInTheDocument();
    // Still wearing Abyss, with nothing of the visitor's own left on top of it.
    expect(palette()).toBe("abyss");
    expect(document.getElementById("palette-lab-overrides")?.textContent ?? "").toBe("");
  });

  it("switches to the palette a pasted export is stamped with", async () => {
    const panel = await openPanel();
    await openAdvanced(panel);

    fireEvent.change(jsonBox(panel), {
      target: {
        value: JSON.stringify({
          themeLab: 1,
          theme: { kind: "preset", id: "twilight" },
          overrides: { dark: { "--theme-accent": "#ff00aa" }, light: {} },
        }),
      },
    });
    await userEvent.click(within(panel).getByRole("button", { name: /Apply JSON/ }));

    expect(within(panel).getByRole("button", { name: /^Twilight/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const styleText = document.getElementById("palette-lab-overrides")?.textContent ?? "";
    expect(palette()).toBe("twilight");
    expect(styleText).toContain("--theme-accent:#ff00aa");
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
      expect(stored.activeThemeRef).toEqual({ kind: "preset", id: "twilight" });
      expect(stored.editsByPreset.twilight.dark["--theme-accent"]).toBe("#ff00aa");
    });
  });

  it("preserves an unknown stored preset id and renders a graceful fallback", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        presetId: "retired-preset",
        overrides: { dark: { "--theme-accent": "#123456" }, light: {} },
      }),
    );

    const panel = await openPanel();

    // No shipped palette claims to be active, the visitor is told why, and
    // their edits still render on the fallback look.
    expect(within(panel).getByRole("button", { name: /^Orchid/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(panel).getByText(/retired-preset/)).toBeInTheDocument();
    expect(document.getElementById("palette-lab-overrides")?.textContent).toContain(
      "--theme-accent:#123456",
    );
    // The saved reference survives the rewrite rather than being overwritten.
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
      expect(stored.activeThemeRef).toEqual({ kind: "preset", id: "retired-preset" });
      expect(stored.editsByPreset["retired-preset"].dark["--theme-accent"]).toBe("#123456");
    });
  });
});
