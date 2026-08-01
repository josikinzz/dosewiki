import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaletteLabLazy as PaletteLab } from "./PaletteLabLazy";
import { PaletteLabTrigger } from "./PaletteLabTrigger";
import { buildPaletteLabBootstrapScript } from "./paletteLabBootstrap";
import { PALETTE_ATTRIBUTE, PALETTE_LAB_OVERRIDE_STYLE_ID } from "./paletteLabStorage";
import { setPaletteLabOpen } from "./paletteLabStore";
import { clearThemeBaselineCache } from "./presetBaselines";

/**
 * Named custom theme slots, through the suite's one seam: *stored envelope in →
 * applied document state out*. Everything asserted here is something a visitor
 * can observe — which card is worn, what the injected override element says,
 * which palette the root names, and what ends up in storage.
 *
 * The pre-paint case is the integration proof that a slot rides the same
 * bootstrap path as a shipped preset rather than needing the panel to open.
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
  document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID)?.remove();
  clearThemeBaselineCache();
  setPaletteLabOpen(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute(PALETTE_ATTRIBUTE);
  document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID)?.remove();
});

function palette() {
  return document.documentElement.getAttribute(PALETTE_ATTRIBUTE);
}

function injectedCss() {
  return document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID)?.textContent ?? "";
}

function stored() {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
}

async function openPanel() {
  render(
    <>
      <PaletteLabTrigger />
      <PaletteLab />
    </>,
  );
  await userEvent.click(await screen.findByRole("button", { name: /Open Theme Lab/i }));
  return screen.findByRole("dialog", { name: "Theme Lab" });
}

async function showGallery(panel: HTMLElement) {
  await userEvent.click(within(panel).getByRole("button", { name: "Themes" }));
}

/** Tweak the accent in the catalog — the standard "the visitor changed
 *  something" move in this suite. */
async function editAccent(panel: HTMLElement, value: string) {
  await userEvent.click(within(panel).getByRole("button", { name: /All colors/ }));
  await userEvent.click(within(panel).getByRole("button", { name: /Accent — base/ }));
  fireEvent.change(within(panel).getByRole("textbox", { name: /Hex/ }), { target: { value } });
}

async function saveAs(panel: HTMLElement, name: string) {
  await userEvent.click(within(panel).getByRole("button", { name: "Save as my theme" }));
  const field = within(panel).getByRole("textbox", { name: "Name for this theme" });
  await userEvent.clear(field);
  await userEvent.type(field, name);
  await userEvent.click(within(panel).getByRole("button", { name: "Save" }));
}

describe("Theme Lab custom themes", { timeout: 20_000 }, () => {
  it("saves the current look as a named theme and wears it", async () => {
    const panel = await openPanel();
    await editAccent(panel, "#abcdef");
    await showGallery(panel);

    expect(within(panel).getByText(/Nothing saved yet/)).toBeInTheDocument();
    await saveAs(panel, "Midnight");

    // A gallery entry like any other, and the one being worn.
    expect(within(panel).getByRole("button", { name: /^Midnight/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // The look is unchanged by being saved: the palette still paints from the
    // stylesheet, the tweak still rides in the injected layer.
    expect(palette()).toBe("orchid");
    expect(injectedCss()).toContain("--theme-accent:#abcdef");
    // Nothing diverges from the slot yet — everything is *in* the slot.
    expect(within(panel).getByText("No changes")).toBeInTheDocument();

    await waitFor(() => {
      const envelope = stored();
      expect(envelope.activeThemeRef).toEqual({ kind: "custom", id: "custom-1" });
      expect(envelope.customThemes).toHaveLength(1);
      const [slot] = envelope.customThemes;
      expect(slot.name).toBe("Midnight");
      expect(slot.basePresetId).toBe("orchid");
      // Self-contained: the resolved look, both themes, not a pointer at one.
      expect(slot.overrides.dark["--theme-accent"]).toBe("#abcdef");
      expect(slot.overrides.light).toEqual({});
      // Additive: the palette it was captured from keeps its own edits.
      expect(envelope.editsByPreset.orchid.dark["--theme-accent"]).toBe("#abcdef");
      expect(envelope.editsByPreset["custom:custom-1"]).toBeUndefined();
    });
  });

  it("keeps several slots, renames one, and asks before discarding one", async () => {
    const panel = await openPanel();
    await editAccent(panel, "#abcdef");
    await showGallery(panel);
    await saveAs(panel, "One");
    await saveAs(panel, "Two");

    expect(within(panel).getByRole("button", { name: /^One/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /^Two/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Rename is behind its own affordance, and takes effect on the card.
    await userEvent.click(within(panel).getByRole("button", { name: "Rename One" }));
    const field = within(panel).getByRole("textbox", { name: "New name for One" });
    await userEvent.clear(field);
    await userEvent.type(field, "Uno");
    await userEvent.click(within(panel).getByRole("button", { name: "Save" }));
    expect(within(panel).getByRole("button", { name: /^Uno/ })).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /^One/ })).not.toBeInTheDocument();

    // Delete asks first, and backing out keeps the theme.
    await userEvent.click(within(panel).getByRole("button", { name: "Delete Uno" }));
    expect(within(panel).getByText(/Delete “Uno”\?/)).toBeInTheDocument();
    await waitFor(() => expect(stored().customThemes).toHaveLength(2));
    await userEvent.click(within(panel).getByRole("button", { name: "Keep" }));
    expect(within(panel).getByRole("button", { name: /^Uno/ })).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole("button", { name: "Delete Uno" }));
    await userEvent.click(within(panel).getByRole("button", { name: "Delete" }));
    expect(within(panel).queryByRole("button", { name: /^Uno/ })).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /^Two/ })).toBeInTheDocument();

    await waitFor(() => {
      const envelope = stored();
      expect(envelope.customThemes).toHaveLength(1);
      expect(envelope.customThemes[0].name).toBe("Two");
    });
  });

  it("applies a saved theme with one tap, exactly like a shipped preset", async () => {
    const panel = await openPanel();
    await userEvent.click(within(panel).getByRole("button", { name: /^Abyss/ }));
    await editAccent(panel, "#abcdef");
    await showGallery(panel);
    await saveAs(panel, "Mine");

    // Wear a shipped preset: the slot's layer goes away with it.
    await userEvent.click(within(panel).getByRole("button", { name: /^Twilight/ }));
    expect(palette()).toBe("twilight");
    expect(injectedCss()).not.toContain("#abcdef");

    // One tap back: the slot's base palette paints from the stylesheet and its
    // own tokens ride in the injected layer.
    await userEvent.click(within(panel).getByRole("button", { name: /^Mine/ }));
    expect(palette()).toBe("abyss");
    expect(injectedCss()).toContain("--theme-accent:#abcdef");
  });

  it("files edits made on a saved theme under that theme, not the preset it came from", async () => {
    const panel = await openPanel();
    await userEvent.click(within(panel).getByRole("button", { name: /^Abyss/ }));
    await editAccent(panel, "#abcdef");
    await showGallery(panel);
    await saveAs(panel, "Mine");

    await editAccent(panel, "#0f0f0f");
    expect(injectedCss()).toContain("--theme-accent:#0f0f0f");

    await waitFor(() => {
      const envelope = stored();
      expect(envelope.editsByPreset["custom:custom-1"].dark["--theme-accent"]).toBe("#0f0f0f");
      // The shipped preset's own map is untouched by editing the slot.
      expect(envelope.editsByPreset.abyss.dark["--theme-accent"]).toBe("#abcdef");
      // And the slot's saved look is what it was saved as.
      expect(envelope.customThemes[0].overrides.dark["--theme-accent"]).toBe("#abcdef");
    });

    // Deleting the slot takes its edits with it and falls back to its base.
    await showGallery(panel);
    await userEvent.click(within(panel).getByRole("button", { name: "Delete Mine" }));
    await userEvent.click(within(panel).getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      const envelope = stored();
      expect(envelope.customThemes).toEqual([]);
      expect(envelope.editsByPreset["custom:custom-1"]).toBeUndefined();
      expect(envelope.activeThemeRef).toEqual({ kind: "preset", id: "abyss" });
    });
  });

  it("restores a saved theme pre-paint, with no panel and no flash", async () => {
    const panel = await openPanel();
    await editAccent(panel, "#abcdef");
    await showGallery(panel);
    await saveAs(panel, "Midnight");
    await waitFor(() => expect(stored().customThemes).toHaveLength(1));

    // A hard refresh: nothing of the applied look survives into the new
    // document, and only the head script has run.
    document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID)?.remove();
    document.documentElement.removeAttribute(PALETTE_ATTRIBUTE);
    Function(buildPaletteLabBootstrapScript())();

    expect(palette()).toBe("orchid");
    expect(injectedCss()).toContain("--theme-accent:#abcdef");
  });

  it("round-trips a saved theme through export", async () => {
    const panel = await openPanel();
    await editAccent(panel, "#abcdef");
    await showGallery(panel);
    await saveAs(panel, "Midnight");

    await userEvent.click(within(panel).getByRole("button", { name: /Advanced/ }));
    const box = within(panel).getByRole("textbox", {
      name: /Theme colors JSON/,
    }) as HTMLTextAreaElement;

    // Stamped as the slot, and carrying the slot's own look.
    const payload = JSON.parse(box.value);
    expect(payload.theme).toEqual({ kind: "custom", id: "custom-1" });
    expect(payload.overrides.dark["--theme-accent"]).toBe("#abcdef");

    // Pasting it back describes the same theme, so it leaves no edits behind.
    fireEvent.change(box, { target: { value: box.value } });
    await userEvent.click(within(panel).getByRole("button", { name: /Apply JSON/ }));

    await waitFor(() => {
      const envelope = stored();
      expect(envelope.activeThemeRef).toEqual({ kind: "custom", id: "custom-1" });
      expect(envelope.editsByPreset["custom:custom-1"]).toBeUndefined();
    });
    expect(injectedCss()).toContain("--theme-accent:#abcdef");
  });
});
