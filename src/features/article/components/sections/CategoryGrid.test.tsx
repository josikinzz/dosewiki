import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { DosageCategoryGroup } from "@/data/builders/library";
import { CategoryGrid } from "./CategoryGrid";

const groups: DosageCategoryGroup[] = [
  {
    key: "psychedelics",
    name: "Psychedelics",
    icon: "lucide:sparkles",
    total: 2,
    drugs: [
      { name: "LSD", slug: "lsd" },
      { name: "DXM", slug: "dxm" },
    ],
  },
];

describe("CategoryGrid", () => {
  it("names category toggles with category label and expanded state", async () => {
    const user = userEvent.setup();

    render(<CategoryGrid groups={groups} defaultExpanded={false} maxColumns={1} />);

    const expandButton = screen.getByRole("button", {
      name: "Expand Psychedelics category",
    });

    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    expect(expandButton).toHaveAttribute("aria-controls", "psychedelics-list");
    expect(expandButton).toHaveClass(
      "theme-focus-ring",
    );

    await user.click(expandButton);

    expect(
      screen.getByRole("button", { name: "Collapse Psychedelics category" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("links only substances with canonical public article routes", () => {
    render(
      <CategoryGrid
        groups={groups}
        drugHrefPrefix="/"
        linkableDrugSlugs={["lsd"]}
        maxColumns={1}
      />,
    );

    expect(screen.getByRole("link", { name: "LSD" })).toHaveAttribute("href", "/lsd");
    expect(screen.getByText("DXM").closest("a")).toBeNull();
  });
});
