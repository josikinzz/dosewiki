import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  compareCanonicalSmilesMock,
  compareInchiMock,
  installMoleculeEditorTestHarness,
  renderMoleculeSvgMock,
  seedExampleSubstance,
  stubMoleculeEditorFetch,
  smilesToMolblockMock,
  stubOverrideFetch,
  useOclMock,
  useQueryMock,
  useRdkitMock,
} from "./MoleculeEditorTab.testHarness";
import { MoleculeEditorTab } from "./MoleculeEditorTab";

describe("MoleculeEditorTab substance canvas flows", () => {
  installMoleculeEditorTestHarness();
  it("arms the bond pick overlay from Set bond vertical and routes both alignment requests", async () => {
    seedExampleSubstance();
    stubOverrideFetch();

    render(<MoleculeEditorTab />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Select a substance" }));
    await user.click(await screen.findByText("Example"));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "saved molblock"),
    );

    // Both alignment controls work without any prior selection: Set bond vertical
    // arms the canvas pick overlay instead of demanding a lasso selection.
    const setVertical = screen.getByRole("button", { name: "Set bond vertical" });
    const straighten = screen.getByRole("button", { name: "Straighten" });
    await waitFor(() => {
      expect(straighten).toBeEnabled();
      expect(setVertical).toBeEnabled();
    });

    await user.click(setVertical);
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-bond-pick", "true");
    // While armed, the same control cancels the pick.
    const cancelPick = screen.getByRole("button", { name: "Cancel bond pick" });
    expect(cancelPick).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Pick a bond" }));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-bond-pick", "false"),
    );
    expect(screen.getByText("Aligned")).toBeInTheDocument();
    expect(
      screen.getByText("Rotated 12°. The bond is now vertical. Save to publish."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set bond vertical" })).toBeEnabled();

    // Canceling from the canvas (Esc) exits pick mode without posting a notice.
    await user.click(screen.getByRole("button", { name: "Set bond vertical" }));
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-bond-pick", "true");
    await user.click(screen.getByRole("button", { name: "Cancel pick from canvas" }));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-bond-pick", "false"),
    );

    // A single lasso-selected bond still applies immediately — no pick mode.
    await user.click(screen.getByRole("button", { name: "Select one bond" }));
    await user.click(screen.getByRole("button", { name: "Set bond vertical" }));
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-bond-pick", "false");
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-snap-request", "bond-vertical");
    // Both alignment controls stay off while a request is in flight.
    expect(screen.getByRole("button", { name: "Set bond vertical" })).toBeDisabled();
    expect(straighten).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Complete snap request" }));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-snap-request", ""),
    );

    // An ambiguous lasso selection falls back to the pick overlay.
    await user.click(screen.getByRole("button", { name: "Select two bonds" }));
    await user.click(screen.getByRole("button", { name: "Set bond vertical" }));
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-bond-pick", "true");
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-snap-request", "");
    await user.click(screen.getByRole("button", { name: "Cancel bond pick" }));

    await user.click(straighten);
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-snap-request", "straighten");
  });

  it("imports another substance's saved depiction as an analogue starting point", async () => {
    const ocl = { Molecule: {} };
    useOclMock.mockReturnValue({ ocl, error: null });
    useRdkitMock.mockReturnValue({ rdkit: {}, error: null });
    renderMoleculeSvgMock.mockReturnValue("<svg />");
    compareInchiMock.mockReturnValue({ match: false, inchiOriginal: "a", inchiEdited: "b" });
    useQueryMock.mockReturnValue(undefined);
    stubMoleculeEditorFetch({
      picker: [
        {
          slug: "example",
          title: "Example",
          priority: "normal",
          index_categories: ["substance"],
          classification: null,
          hasOverride: true,
        },
        {
          slug: "donor",
          title: "Donor",
          priority: "normal",
          index_categories: ["substance"],
          classification: null,
          hasOverride: true,
        },
      ],
      sources: {
        example: { slug: "example", smiles: "CCO" },
        donor: { slug: "donor", smiles: "CCO" },
      },
      overrides: {
        example: {
          slug: "example",
          molblock: "example molblock",
          svg: "<svg />",
          updatedAt: "2026-07-12T00:00:00.000Z",
        },
        donor: {
          slug: "donor",
          molblock: "donor molblock",
          svg: "<svg />",
          updatedAt: "2026-07-12T00:00:00.000Z",
        },
      },
    });

    render(<MoleculeEditorTab />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Select a substance" }));
    await user.click(await screen.findByText("Example"));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "example molblock"),
    );

    await user.click(screen.getByRole("combobox", { name: "Select a structure to import" }));
    await user.click(await screen.findByText("Donor"));
    await user.click(screen.getByRole("button", { name: "Load structure" }));

    // The canvas replaces its content with the donor structure, unsaved.
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "donor molblock"),
    );
    expect(screen.getByText(/imported structure, unsaved/)).toBeInTheDocument();
    expect(screen.getByText("Structure imported")).toBeInTheDocument();
    // Nothing publishes until the user edits: the save gate stays closed.
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
  });

  it("seeds the canvas from pasted SMILES with an automatic layout", async () => {
    const ocl = { Molecule: {} };
    useOclMock.mockReturnValue({ ocl, error: null });
    useRdkitMock.mockReturnValue({ rdkit: {}, error: null });
    renderMoleculeSvgMock.mockReturnValue("<svg />");
    compareInchiMock.mockReturnValue({ match: true });
    smilesToMolblockMock.mockResolvedValue("pasted molblock");
    seedExampleSubstance();
    stubOverrideFetch();

    render(<MoleculeEditorTab />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Select a substance" }));
    await user.click(await screen.findByText("Example"));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "saved molblock"),
    );

    await user.type(
      screen.getByRole("textbox", { name: "SMILES to load into the canvas" }),
      "CCN",
    );
    await user.click(screen.getByRole("button", { name: "Load SMILES" }));

    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "pasted molblock"),
    );
    expect(smilesToMolblockMock).toHaveBeenCalledWith("CCN");
    expect(screen.getByText("Structure loaded from SMILES")).toBeInTheDocument();
  });

  it("keeps a canvas edit when Postgres redelivers an equal article", async () => {
    // A live query hands back a fresh object identity on every redelivery — a
    // resubscribe, or any write touching the row. That must not resolve the
    // baseline again and discard the drawing: the canvas is uncontrolled once
    // loaded, so a silent reset leaves the user looking at a depiction that is
    // no longer what Save publishes. This is how a rotation reached the canvas
    // but never the article.
    const rdkit = { get_mol: vi.fn() };
    const ocl = { Molecule: {} };
    useRdkitMock.mockReturnValue({ rdkit, error: null });
    useOclMock.mockReturnValue({ ocl, error: null });
    renderMoleculeSvgMock.mockReturnValue("<svg />");
    compareInchiMock.mockReturnValue({ match: true });
    compareCanonicalSmilesMock.mockReturnValue({ match: true });
    seedExampleSubstance();
    const fetchSpy = stubOverrideFetch();

    render(<MoleculeEditorTab />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Select a substance" }));
    await user.click(await screen.findByText("Example"));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "saved molblock"),
    );

    await user.click(screen.getByRole("button", { name: "Emit rotation" }));
    await waitFor(() =>
      expect(renderMoleculeSvgMock).toHaveBeenLastCalledWith(
        ocl,
        "rotated molblock",
        {},
        [],
      ),
    );
    expect(compareInchiMock).toHaveBeenLastCalledWith(rdkit, "CCO", "rotated molblock");
    expect(screen.getByRole("button", { name: "Save depiction" })).toBeEnabled();

    // Force re-renders, each handing back a fresh `article` identity.
    await user.click(screen.getByRole("button", { name: "Select one bond" }));
    await user.click(screen.getByRole("button", { name: "Select two bonds" }));

    // The edit survives, and the canvas was never reloaded out from under it.
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "saved molblock");

    fetchSpy.mockClear();
    await user.click(screen.getByRole("button", { name: "Save depiction" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const saveCall = fetchSpy.mock.calls.find(([url]) => url === "/api/dev/molecule-override");
    expect(saveCall).toBeDefined();
    expect(JSON.parse(String((saveCall?.[1] as RequestInit).body))).toMatchObject({
      slug: "example",
      molblock: "rotated molblock",
    });
  });
});
