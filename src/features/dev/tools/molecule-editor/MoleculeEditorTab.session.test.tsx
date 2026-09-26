import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  compareInchiMock,
  installMoleculeEditorTestHarness,
  smilesToMolblockMock,
  stubMoleculeEditorFetch,
  stubOverrideFetch,
  useQueryMock,
} from "./MoleculeEditorTab.testHarness";
import { MoleculeEditorTab } from "./MoleculeEditorTab";

const SAVED = { svg: "<svg />", updatedAt: "2026-07-12T00:00:00.000Z" };

function pickerRow(slug: string, title: string) {
  return {
    slug,
    title,
    priority: "normal",
    index_categories: ["substance"],
    classification: null,
    hasOverride: true,
  };
}

/** Two substances with saved depictions, so selection can move between them. */
function stubTwoSubstances() {
  useQueryMock.mockReturnValue(undefined);
  return stubMoleculeEditorFetch({
    picker: [pickerRow("example", "Example"), pickerRow("donor", "Donor")],
    sources: {
      example: { slug: "example", smiles: "CCO" },
      donor: { slug: "donor", smiles: "CCN" },
    },
    overrides: {
      example: { slug: "example", molblock: "example molblock", ...SAVED },
      donor: { slug: "donor", molblock: "donor molblock", ...SAVED },
    },
  });
}

function deleteCalls(fetchSpy: ReturnType<typeof stubMoleculeEditorFetch>) {
  return fetchSpy.mock.calls
    .filter(([, init]) => init?.method === "DELETE")
    .map(([url]) => String(url));
}

describe("MoleculeEditorTab sessions", () => {
  installMoleculeEditorTestHarness();

  it("opens the structure the URL names, and writes the selection back to the URL", async () => {
    compareInchiMock.mockReturnValue({ match: true });
    stubTwoSubstances();
    const replaceState = vi.spyOn(window.history, "replaceState");

    render(<MoleculeEditorTab initialSlug="substances/donor" />);

    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "donor molblock"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("molecule-pane").querySelector("h3")).toHaveTextContent("Editing Donor"),
    );
    expect(screen.getByText("Editing", { selector: "span.font-medium" })).toBeInTheDocument();
    expect(replaceState).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.click(await screen.findByText("Example"));
    await waitFor(() =>
      expect(replaceState).toHaveBeenLastCalledWith(null, "", "/dev/molecule-editor/substances/example"),
    );

    await user.click(screen.getByRole("button", { name: /Generic classes/ }));
    await waitFor(() =>
      expect(replaceState).toHaveBeenLastCalledWith(null, "", "/dev/molecule-editor/classes"),
    );
  });

  it("removes a substance override with an explicit, confirmed delete", async () => {
    compareInchiMock.mockReturnValue({ match: true });
    smilesToMolblockMock.mockResolvedValue("auto molblock");
    useQueryMock.mockReturnValue(undefined);
    const fetchSpy = stubOverrideFetch();

    render(<MoleculeEditorTab initialSlug="substances/example" />);
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "saved molblock"),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Remove override" }));
    const dialog = await screen.findByRole("dialog");
    expect(deleteCalls(fetchSpy)).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Remove override" }));

    await waitFor(() =>
      expect(deleteCalls(fetchSpy)).toEqual(["/api/dev/molecule-override?slug=example"]),
    );
    expect(fetchSpy.mock.calls.some(([url, init]) => url === "/api/dev/molecule-override" && init?.method === "POST")).toBe(false);
    expect(await screen.findByText("Override removed. Reverted to the automatic layout.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "auto molblock"),
    );
    expect(screen.getByRole("button", { name: "Remove override" })).toBeDisabled();
  });

  it("reverts to the saved depiction without writing anything", async () => {
    compareInchiMock.mockReturnValue({ match: true });
    useQueryMock.mockReturnValue(undefined);
    const fetchSpy = stubOverrideFetch();

    render(<MoleculeEditorTab initialSlug="substances/example" />);
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "saved molblock"),
    );
    const user = userEvent.setup();
    const revert = screen.getByRole("button", { name: "Revert to saved" });
    expect(revert).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Emit rotation" }));
    await screen.findByText("Unsaved changes");

    await user.click(revert);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Discard and revert" }));

    await waitFor(() => expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument());
    expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "POST" || init?.method === "DELETE")).toBe(false);
  });

  it("starts every session field fresh when the selection changes", async () => {
    compareInchiMock.mockReturnValue({ match: false, inchiOriginal: "a", inchiEdited: "b" });
    stubTwoSubstances();

    render(<MoleculeEditorTab initialSlug="substances/example" />);
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "example molblock"),
    );
    const user = userEvent.setup();

    // Build up session state: an edit, a typed confirmation, pasted SMILES,
    // an import choice, an armed bond pick and a notice.
    await user.click(screen.getByRole("button", { name: "Emit rotation" }));
    await user.type(await screen.findByRole("textbox", { name: /Type Example to publish/ }), "Exa");
    await user.type(screen.getByRole("textbox", { name: "SMILES to load into the canvas" }), "CCN");
    await user.click(screen.getByRole("combobox", { name: "Select a structure to import" }));
    await user.click(await screen.findByRole("option", { name: /Donor/ }));
    await user.click(screen.getByRole("button", { name: "Set bond vertical" }));
    await user.click(screen.getByRole("button", { name: "Pick a bond" }));
    await user.click(screen.getByRole("button", { name: "Set bond vertical" }));
    expect(screen.getByText("Aligned")).toBeInTheDocument();
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-bond-pick", "true");
    await user.click(screen.getByRole("button", { name: /^Donor/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Discard and switch" }));

    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "donor molblock"),
    );
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-bond-pick", "false");
    expect(screen.getByRole("textbox", { name: "SMILES to load into the canvas" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Select a structure to import" })).not.toHaveTextContent("Donor");
    expect(screen.queryByText("Aligned")).not.toBeInTheDocument();
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    expect(screen.getByText("Saved depiction")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Emit rotation" }));
    expect(await screen.findByRole("textbox", { name: /Type Donor to publish/ })).toHaveValue("");
  });

  it("lists OpenChemLib's canvas keys", async () => {
    compareInchiMock.mockReturnValue({ match: true });
    stubTwoSubstances();
    render(<MoleculeEditorTab initialSlug="substances/example" />);
    const legend = await screen.findByRole("region", { name: "Canvas keys" });
    expect(within(legend).getByText("u")).toBeInTheDocument();
    expect(within(legend).getByText("d")).toBeInTheDocument();
  });
});
