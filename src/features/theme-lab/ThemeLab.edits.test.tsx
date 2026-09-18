import { fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import styles from "./ThemeLab.module.css";
import {
  OPEN_LOOK,
  STORAGE_KEY,
  installThemeLabTestHarness,
  jsonBox,
  openAdvanced,
  openPanel,
  switchToEssentials,
  switchToSections,
} from "./ThemeLab.testHarness";

describe("ThemeLab token edits and persistence", { timeout: 15_000 }, () => {
  installThemeLabTestHarness();

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
