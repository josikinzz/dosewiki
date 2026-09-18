import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { SubstanceTargetPicker } from "./SubstanceTargetPicker";
import type { GalleryCandidate } from "./substanceGalleryPortalModel";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= vi.fn();
});

const SUBSTANCES: GalleryCandidate[] = [
  {
    slug: "lsd",
    title: "LSD",
    match_count: 4,
    curated: true,
    curated_count: 2,
    removed_count: 0,
  },
  {
    slug: "psilocybin",
    title: "Psilocybin mushrooms",
    match_count: 3,
    curated: false,
    curated_count: 0,
    removed_count: 0,
  },
];

describe("SubstanceTargetPicker", () => {
  it("searches the complete list and reports controlled selection changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SubstanceTargetPicker
        substances={SUBSTANCES}
        selectedSlugs={[]}
        onSelectedSlugsChange={onChange}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Drug targets. 0 selected" }));
    const search = screen.getByPlaceholderText("Search every drug by name or slug…");
    await user.type(search, "psilo");
    expect(screen.queryByText("LSD")).not.toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith(["psilocybin"]);
  });

  it("shows selected targets, supports deselection, and disables changes while busy", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <SubstanceTargetPicker
        substances={SUBSTANCES}
        selectedSlugs={["lsd"]}
        onSelectedSlugsChange={onChange}
      />,
    );

    expect(screen.getByText("LSD")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove LSD" }));
    expect(onChange).toHaveBeenCalledWith([]);

    rerender(
      <SubstanceTargetPicker
        substances={SUBSTANCES}
        selectedSlugs={["lsd"]}
        onSelectedSlugsChange={onChange}
        busy
      />,
    );
    expect(screen.getByRole("combobox", { name: "Drug targets. 1 selected" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove LSD" })).toBeDisabled();
  });

  it("bounds the initial target list and searches beyond the rendered slice", async () => {
    const user = userEvent.setup();
    const substances = Array.from({ length: 45 }, (_, index) => ({
      slug: `drug-${index}`,
      title: `Drug ${index}`,
      match_count: 0,
      curated: false,
      curated_count: 0,
      removed_count: 0,
    }));
    render(
      <SubstanceTargetPicker
        substances={substances}
        selectedSlugs={[]}
        onSelectedSlugsChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Drug targets. 0 selected" }));
    expect(screen.getByText("Showing the first 40 of 45. Type to narrow the list.")).toBeInTheDocument();
    expect(screen.queryByText("Drug 44")).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search every drug by name or slug…"), "Drug 44");
    expect(screen.getByText("Drug 44")).toBeInTheDocument();
  });
});
