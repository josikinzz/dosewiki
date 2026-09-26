import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LayoutMoveDialog } from "./LayoutMoveDialog";
import type { BoardDestination } from "./boardModel";

const DESTINATIONS: BoardDestination[] = [
  { slot: { categoryKey: "psychedelic", sectionKey: null }, categoryLabel: "Psychedelic", sectionLabel: "General" },
  { slot: { categoryKey: "psychedelic", sectionKey: "common" }, categoryLabel: "Psychedelic", sectionLabel: "Common" },
  { slot: { categoryKey: "dissociative", sectionKey: null }, categoryLabel: "Dissociative", sectionLabel: null },
];

describe("LayoutMoveDialog", () => {
  it("offers every other list, marks where it is and where it already is, and moves on a pick", () => {
    const onMove = vi.fn();
    render(
      <LayoutMoveDialog
        request={{ from: { categoryKey: "psychedelic", sectionKey: "common" }, slug: "lsd", name: "LSD", fromLabel: "Psychedelic, Common" }}
        destinations={DESTINATIONS}
        holds={(slot) => slot.categoryKey === "psychedelic" && slot.sectionKey === null}
        onClose={vi.fn()}
        onMove={onMove}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Move LSD" });
    expect(within(dialog).getByRole("button", { name: /^Common\W+Here now$/ })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: /^General\W+Already here$/ })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Category list" }));
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ slug: "lsd" }), { categoryKey: "dissociative", sectionKey: null });
  });

  it("filters the lists and says when nothing matches", () => {
    render(
      <LayoutMoveDialog
        request={{ from: { categoryKey: "__unplaced", sectionKey: null }, slug: "dxm", name: "DXM", fromLabel: null }}
        destinations={DESTINATIONS}
        holds={() => false}
        onClose={vi.fn()}
        onMove={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Place DXM" });
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Find a list" }), { target: { value: "disso" } });
    expect(within(dialog).queryByRole("button", { name: "Common" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Category list" })).toBeEnabled();
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Find a list" }), { target: { value: "zzz" } });
    expect(within(dialog).getByText(/No list matches/)).toBeInTheDocument();
  });
});
