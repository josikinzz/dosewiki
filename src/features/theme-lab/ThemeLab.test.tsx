import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  installThemeLabTestHarness,
  openPanel,
  searchInput,
  switchToEssentials,
  switchToSections,
} from "./ThemeLab.testHarness";

describe("ThemeLab catalog views", { timeout: 15_000 }, () => {
  installThemeLabTestHarness();

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

  it("shows an empty state when an All colors search has no matches", async () => {
    const panel = await openPanel();
    await switchToSections(panel);

    await userEvent.type(searchInput(panel), "zzzz-no-color");

    expect(within(panel).getByText("No colors match your search.")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /Primary — headings/ })).not.toBeInTheDocument();
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
});
