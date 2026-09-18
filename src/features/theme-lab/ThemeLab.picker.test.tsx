import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { installStyle, installThemeLabTestHarness, openPanel } from "./ThemeLab.testHarness";

describe("ThemeLab page picker", { timeout: 15_000 }, () => {
  installThemeLabTestHarness();

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
});
