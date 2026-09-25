import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("../../pages/useDevRailBadges", () => ({ useDevRailBadges: () => ({}) }));

import {
  expectRailMarksUnsaved,
  renderInDevShell,
  switchTabExpectingGuard,
} from "../../pages/devShellTestHarness";
import {
  compareCanonicalSmilesMock,
  compareInchiMock,
  installMoleculeEditorTestHarness,
  seedExampleSubstance,
  stubOverrideFetch,
} from "./MoleculeEditorTab.testHarness";
import { MoleculeEditorTab } from "./MoleculeEditorTab";

function seedExample() {
  compareInchiMock.mockReturnValue({ match: true });
  compareCanonicalSmilesMock.mockReturnValue({ match: true });
  seedExampleSubstance();
  stubOverrideFetch();
  const user = userEvent.setup();
  return user;
}

describe("MoleculeEditorTab reports unsaved work to the shell", () => {
  installMoleculeEditorTestHarness();

  it("marks the rail and asks before a tab switch drops an edited depiction", async () => {
    const user = seedExample();
    const { nav, onTabChange } = renderInDevShell(<MoleculeEditorTab />, { tab: "molecule-editor" });
    await user.click(screen.getByRole("combobox", { name: "Select a substance" }));
    await user.click(await screen.findByText("Example"));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "saved molblock"),
    );
    await user.click(screen.getByRole("button", { name: "Emit rotation" }));
    await screen.findByText("Unsaved changes");

    expectRailMarksUnsaved(nav, "Molecules");
    const dialog = switchTabExpectingGuard(nav, onTabChange);
    expect(within(dialog).getByText("Molecules: Example")).toBeTruthy();
    // A substance save is the live depiction: the shell only discards.
    expect(within(dialog).queryByRole("button", { name: "Save" })).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    expect(onTabChange).toHaveBeenCalledWith("articles");
    await waitFor(() => expect(screen.queryByText("Unsaved changes")).toBeNull());
  });

  it("adds no beforeunload listener of its own while dirty", async () => {
    const user = seedExample();
    const add = vi.spyOn(window, "addEventListener");
    render(<MoleculeEditorTab />);
    await user.click(screen.getByRole("combobox", { name: "Select a substance" }));
    await user.click(await screen.findByText("Example"));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "saved molblock"),
    );
    await user.click(screen.getByRole("button", { name: "Emit rotation" }));
    await screen.findByText("Unsaved changes");

    expect(add.mock.calls.filter(([type]) => type === "beforeunload")).toEqual([]);
  });
});
