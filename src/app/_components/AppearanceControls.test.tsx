import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  COLOR_SCHEME_STORAGE_KEY,
  ThemeProvider,
  VISUAL_STYLE_STORAGE_KEY,
} from "@/context/ThemeContext";
import { AppearanceControls } from "./AppearanceControls";
import { ThemeToggle } from "./ThemeToggle";
import { VisualStyleToggle } from "./VisualStyleToggle";

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-testid="icon">{icon}</span>,
}));

describe("AppearanceControls", () => {
  // Pin the starting appearance in both places the provider can restore it from, so the
  // "Switch to day mode" / "Switch to Pro visual style" queries below mean the same thing
  // whichever publication flavor the suite runs under.
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, "dark");
    window.localStorage.setItem(VISUAL_STYLE_STORAGE_KEY, "fun");
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.visualStyle = "fun";
  });

  it("presents the two axes as one labelled group of 44px targets", () => {
    render(
      <ThemeProvider initialColorScheme="dark" initialVisualStyle="fun" isVisualStyleLocked={false}>
        <AppearanceControls />
      </ThemeProvider>,
    );

    const pills = within(screen.getByRole("group", { name: "Appearance" })).getAllByRole("button");

    expect(pills.map((pill) => pill.dataset.appearanceAxis)).toEqual([
      "color-scheme",
      "visual-style",
    ]);
    expect(pills.map((pill) => pill.dataset.appearanceValue)).toEqual(["dark", "fun"]);
    // jsdom does no layout, so the hit area is only observable as the sizing classes both
    // pills share: h-11 is the 44px minimum, and the twins must not diverge.
    for (const pill of pills) {
      expect(pill.className).toMatch(/(?:^|\s)h-11(?:\s|$)/);
      expect(pill.className).toMatch(/(?:^|\s)w-20(?:\s|$)/);
    }
    expect(within(pills[1]).getByText("streamline:smiley-cute-remix")).toBeInTheDocument();
    expect(within(pills[1]).getByText("hugeicons:tie")).toBeInTheDocument();
  });

  it("holds no state of its own: every mounted control reflects one provider", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider initialColorScheme="dark" initialVisualStyle="fun" isVisualStyleLocked={false}>
        <AppearanceControls />
        {/* A second, independently mounted pair. Were the controls holding local state,
            these would disagree with the group above after the first click. */}
        <ThemeToggle />
        <VisualStyleToggle />
      </ThemeProvider>,
    );

    await user.click(screen.getAllByRole("button", { name: "Switch to day mode" })[0]);

    await waitFor(() => {
      const dayNight = screen.getAllByRole("button", { name: "Switch to night mode" });
      expect(dayNight).toHaveLength(2);
      expect(dayNight.map((pill) => pill.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
    });

    await user.click(screen.getAllByRole("button", { name: "Switch to Pro visual style" })[1]);

    await waitFor(() => {
      const funPro = screen.getAllByRole("button", { name: "Switch to Fun visual style" });
      expect(funPro).toHaveLength(2);
      expect(funPro.map((pill) => pill.dataset.appearanceValue)).toEqual(["pro", "pro"]);
    });
  });

  it("drives both document attributes, which is what makes /dev/kit a four-way harness", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider initialColorScheme="dark" initialVisualStyle="fun" isVisualStyleLocked={false}>
        <AppearanceControls />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Switch to Pro visual style" }));
    await user.click(screen.getByRole("button", { name: "Switch to day mode" }));

    await waitFor(() => {
      expect(document.documentElement.dataset.visualStyle).toBe("pro");
      expect(document.documentElement.dataset.theme).toBe("light");
    });
  });

  it("operates from the keyboard alone", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider initialColorScheme="dark" initialVisualStyle="fun" isVisualStyleLocked={false}>
        <AppearanceControls />
      </ThemeProvider>,
    );

    await user.tab();
    expect(screen.getByRole("button", { name: "Switch to day mode" })).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Switch to night mode" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    await user.tab();
    expect(screen.getByRole("button", { name: "Switch to Pro visual style" })).toHaveFocus();
    await user.keyboard(" ");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Switch to Fun visual style" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
  });

  it("renders nothing but day and night when the publication locks its style", () => {
    render(
      <ThemeProvider initialColorScheme="light" initialVisualStyle="pro" isVisualStyleLocked>
        <AppearanceControls />
      </ThemeProvider>,
    );

    const pills = within(screen.getByRole("group", { name: "Appearance" })).getAllByRole("button");

    expect(pills.map((pill) => pill.dataset.appearanceAxis)).toEqual(["color-scheme"]);
    expect(screen.queryByRole("button", { name: /visual style/ })).not.toBeInTheDocument();
  });
});
