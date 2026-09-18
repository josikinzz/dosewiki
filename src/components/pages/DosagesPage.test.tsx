import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SubstanceLookupEntry } from "@/data/LightweightDataProvider";
import type { CategoryLayout, CategoryLayoutCategory } from "@/hooks/useCategoryLayout";
import { DosagesPage } from "./DosagesPage";

const categoryEntries: Array<Pick<CategoryLayoutCategory, "key" | "label" | "iconKey">> = [
  { key: "psychedelic", label: "Psychedelic", iconKey: "psychedelic" },
  { key: "dissociative", label: "Dissociative", iconKey: "dissociative" },
  { key: "deliriant", label: "Deliriant", iconKey: "deliriant" },
  { key: "cannabinoid", label: "Cannabinoid", iconKey: "cannabinoid" },
  { key: "entactogen", label: "Entactogen", iconKey: "entactogen" },
  { key: "stimulant", label: "Stimulant", iconKey: "stimulant" },
  { key: "nootropic", label: "Nootropic", iconKey: "nootropic" },
  { key: "gabaergic", label: "GABAergic", iconKey: "gabaergic" },
  { key: "opioid", label: "Opioid", iconKey: "opioid" },
  { key: "antidepressant", label: "Antidepressant", iconKey: "antidepressant" },
  { key: "antipsychotic", label: "Antipsychotic", iconKey: "antipsychotic" },
];

const layout: CategoryLayout = {
  version: 1,
  categories: categoryEntries.map((category) => ({
    ...category,
    drugs: [],
    sections: [
      {
        key: "common",
        label: "Common",
        drugs: [`${category.key}-sample`],
      },
    ],
  })),
};

const substances: SubstanceLookupEntry[] = categoryEntries.map((category) => ({
  slug: `${category.key}-sample`,
  name: `${category.label} sample`,
  priority: "normal",
}));

describe("DosagesPage", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/substances");
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders a routed class as the first selected view", () => {
    render(
      <DosagesPage
        layout={layout}
        substances={substances}
        initialView="stimulant"
      />,
    );

    expect(screen.getByRole("tab", { name: "Stimulant" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("link", { name: "Stimulant sample" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Psychedelic sample" }),
    ).not.toBeInTheDocument();
  });

  it("renders common substances in their class section without inflating the category total", () => {
    const dualLayout: CategoryLayout = {
      version: 1,
      categories: [{
        key: "gabaergic",
        label: "GABAergic",
        iconKey: "gabaergic",
        drugs: [],
        sections: [
          { key: "common", label: "Common", drugs: ["alprazolam"] },
          { key: "benzodiazepines", label: "Benzodiazepines", drugs: ["alprazolam"] },
        ],
      }],
    };

    render(
      <DosagesPage
        layout={dualLayout}
        substances={[{ slug: "alprazolam", name: "Alprazolam", priority: "high" }]}
      />,
    );

    expect(screen.getAllByRole("link", { name: "Alprazolam" })).toHaveLength(2);
    const categoryHeader = screen.getByRole("heading", { name: "GABAergic" }).parentElement;
    expect(categoryHeader).not.toBeNull();
    expect(within(categoryHeader!).getByLabelText("1 item")).toBeInTheDocument();
  });

  it("migrates a legacy class fragment to its routed view", async () => {
    window.history.replaceState(null, "", "/substances#opioid");
    render(<DosagesPage layout={layout} substances={substances} />);

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Opioid" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(window.location.pathname).toBe("/substances/group/opioid");
    expect(window.location.hash).toBe("");
  });

  it("shows no intro on the All tab and the category definition on a class tab", () => {
    render(
      <DosagesPage
        layout={layout}
        substances={substances}
        definitions={{
          psychedelic: {
            definition: "**Psychedelics** alter perception and cognition.",
            warning: "",
          },
        }}
      />,
    );

    const mobileFilters = screen.getByRole("group", {
      name: "Filter substances by class",
    });

    expect(mobileFilters.closest("[data-nosnippet]")).toBeInTheDocument();
    // The All tab opens straight into the grid: no standing introduction.
    expect(screen.queryByLabelText("Substance index tab introduction")).not.toBeInTheDocument();

    fireEvent.click(within(mobileFilters).getByRole("button", { name: "Psychedelic" }));

    const intro = screen.getByLabelText("Substance index tab introduction");
    expect(intro).toHaveTextContent("Psychedelics alter perception and cognition.");
    expect(
      mobileFilters.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders the substance class filters as a balanced mobile icon grid", () => {
    render(<DosagesPage layout={layout} substances={substances} />);

    const mobileFilters = screen.getByRole("group", {
      name: "Filter substances by class",
    });
    const buttons = within(mobileFilters).getAllByRole("button");

    // Eight tracks, two per tile: fourteen tabs split 4/4/3/3, and each
    // three-tile row starts one track in so it sits centred.
    expect(mobileFilters).toHaveClass("grid-cols-8");
    expect(buttons).toHaveLength(14);
    expect(within(mobileFilters).getByRole("button", { name: "All" })).toHaveClass("col-start-1");
    expect(within(mobileFilters).getByRole("button", { name: "Nootropic" })).toHaveClass(
      "col-start-2",
    );
    expect(within(mobileFilters).getByRole("button", { name: "Opioid" })).toHaveClass(
      "col-start-2",
    );
    expect(within(mobileFilters).getByRole("button", { name: "Antidepressant" })).toHaveClass(
      "col-start-4",
    );
    expect(within(mobileFilters).getByRole("button", { name: "Antipsychotic" })).toHaveClass(
      "col-start-6",
    );
    expect(within(mobileFilters).getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(within(mobileFilters).getByRole("button", { name: "Psychedelic" }));

    expect(within(mobileFilters).getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(mobileFilters).getByRole("button", { name: "Psychedelic" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("scrolls to the category panels when the active mobile icon tab is tapped again", () => {
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);

    render(<DosagesPage layout={layout} substances={substances} />);

    const mobileFilters = screen.getByRole("group", {
      name: "Filter substances by class",
    });

    fireEvent.click(within(mobileFilters).getByRole("button", { name: "Psychedelic" }));

    expect(scrollIntoView).not.toHaveBeenCalled();

    fireEvent.click(within(mobileFilters).getByRole("button", { name: "Psychedelic" }));

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  it("does not scroll when switching desktop tabs, only when re-clicking the active tab", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);

    render(<DosagesPage layout={layout} substances={substances} />);

    // Radix activates a desktop tab on focus, which updates the active tab
    // before the click handler runs. Switching to a new tab must not scroll.
    const desktopTabs = screen.getByRole("tablist", {
      name: "Filter substances by class",
    });

    await user.click(within(desktopTabs).getByRole("tab", { name: "Psychedelic" }));

    expect(scrollIntoView).not.toHaveBeenCalled();

    // Re-clicking the tab you are already on scrolls down to the panels.
    await user.click(within(desktopTabs).getByRole("tab", { name: "Psychedelic" }));

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });
});
