import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("./useDevRailBadges", () => ({ useDevRailBadges: () => ({}), useDevRailBadgeReadings: () => ({}) }));

import { expectRailMarksUnsaved, renderInDevShell } from "./devShellTestHarness";
import { useStagedSetUnsavedWork } from "./useStagedSetUnsavedWork";

function StagedSet(props: { hasArticleDatasetChanges: boolean; hasIndexLayoutChanges: boolean }) {
  useStagedSetUnsavedWork(props);
  return null;
}

describe("useStagedSetUnsavedWork", () => {
  it("marks Tags and Index layout, lets a rail click through, and stops Leave for both", () => {
    const { nav, onTabChange, onLeave } = renderInDevShell(
      <StagedSet hasArticleDatasetChanges hasIndexLayoutChanges />,
      { tab: "writing" },
    );

    expectRailMarksUnsaved(nav, "Tags");
    expectRailMarksUnsaved(nav, "Index layout");

    // The working set outlives the tool switch, so a rail click never asks.
    fireEvent.click(within(nav).getByRole("button", { name: /^Substances/ }));
    expect(onTabChange).toHaveBeenCalledWith("articles");
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "Leave editor" })[0]);
    const dialog = screen.getByRole("dialog", { name: /Save or discard 2 unsaved changes/ });
    expect(within(dialog).getByText("Tags: article edits not yet committed")).toBeTruthy();
    expect(within(dialog).getByText("Index layout: layout edits not yet committed")).toBeTruthy();
    // Commit asks its own questions: the dialog offers no Save.
    expect(within(dialog).queryByRole("button", { name: "Save" })).toBeNull();
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("stays quiet when the working set matches production", () => {
    const { onLeave } = renderInDevShell(
      <StagedSet hasArticleDatasetChanges={false} hasIndexLayoutChanges={false} />,
      { tab: "writing" },
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Leave editor" })[0]);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
