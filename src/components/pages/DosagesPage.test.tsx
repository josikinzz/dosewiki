import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("shows the substance index intro only as the All tab introduction below the filters", () => {
    render(<DosagesPage layout={layout} substances={substances} />);

    const mobileFilters = screen.getByRole("group", {
      name: "Filter substances by class",
    });
    const intro = screen.getByLabelText("Substance index tab introduction");

    expect(intro).toHaveTextContent(
      "Browse 11 substance articles focused on education and harm reduction",
    );
    expect(intro).toHaveTextContent("organized across 11 psychoactive classes");
    expect(
      mobileFilters.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(within(mobileFilters).getByRole("button", { name: "Psychedelic" }));

    expect(screen.queryByLabelText("Substance index tab introduction")).not.toBeInTheDocument();
  });

  it("renders the substance class filters as a compact four-column mobile icon grid", () => {
    render(<DosagesPage layout={layout} substances={substances} />);

    const mobileFilters = screen.getByRole("group", {
      name: "Filter substances by class",
    });
    const buttons = within(mobileFilters).getAllByRole("button");

    expect(mobileFilters).toHaveClass("grid-cols-4");
    expect(buttons).toHaveLength(14);
    expect(within(mobileFilters).getByRole("button", { name: "Antidepressant" })).toHaveClass(
      "col-start-2",
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
});
