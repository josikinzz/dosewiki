import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import {
  compareCanonicalSmilesMock,
  compareInchiMock,
  installMoleculeEditorTestHarness,
  renderMoleculeSvgMock,
  smilesToMolblockMock,
  useOclMock,
  useQueryMock,
  useRdkitMock,
  useSubstanceLookupMock,
} from "./MoleculeEditorTab.testHarness";
import { MoleculeEditorTab } from "./MoleculeEditorTab";
import { RDKIT_PHENETHYLAMINE } from "./classMolblockFixture";

describe("MoleculeEditorTab canvas and imports", () => {
  installMoleculeEditorTestHarness();
  it("arms the bond pick overlay from Set bond vertical and routes both alignment requests", async () => {
    useSubstanceLookupMock.mockReturnValue({
      lookup: [{ slug: "example", name: "Example" }],
      isLoading: false,
      status: "Exhausted",
    });
    useQueryMock.mockImplementation((query, args) => {
      const functionName = getFunctionName(query);
      if (functionName === "moleculeOverrides:listSlugs") {
        return [{ slug: "example" }];
      }
      if (functionName === "substanceIndex:getBySlug") {
        return args === "skip" ? undefined : { identification: { smiles: "CCO" } };
      }
      return undefined;
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          override: {
            slug: "example",
            molblock: "saved molblock",
            svg: "<svg />",
            updatedAt: "2026-07-12T00:00:00.000Z",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

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
    expect(straighten).toBeEnabled();
    expect(setVertical).toBeEnabled();

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
      screen.getByText("Rotated 12° — the bond is now vertical. Save to publish."),
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

  it("routes a rotation edit through preview, guard, dirty state, and the existing save gate", async () => {
    const rdkit = {};
    const ocl = { Molecule: {} };
    useRdkitMock.mockReturnValue({ rdkit, error: null });
    useOclMock.mockReturnValue({ ocl, error: null });
    renderMoleculeSvgMock.mockReturnValue("<svg />");
    compareInchiMock.mockReturnValue({
      match: true,
      inchiOriginal: "InChI=1S/example",
      inchiEdited: "InChI=1S/example",
    });
    const lookup = [{ slug: "example", name: "Example" }];
    const overrideList = [{ slug: "example" }];
    const article = { identification: { smiles: "CCO" } };
    useSubstanceLookupMock.mockReturnValue({
      lookup,
      isLoading: false,
      status: "Exhausted",
    });
    useQueryMock.mockImplementation((query, args) => {
      const functionName = getFunctionName(query);
      if (functionName === "moleculeOverrides:listSlugs") {
        return overrideList;
      }
      if (functionName === "substanceIndex:getBySlug") {
        return args === "skip" ? undefined : article;
      }
      return undefined;
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          override: {
            slug: "example",
            molblock: "saved molblock",
            svg: "<svg />",
            updatedAt: "2026-07-12T00:00:00.000Z",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<MoleculeEditorTab />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Select a substance" }));
    await user.click(await screen.findByText("Example"));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute(
        "data-source",
        "saved molblock",
      ),
    );
    await waitFor(() =>
      expect(renderMoleculeSvgMock).toHaveBeenLastCalledWith(ocl, "saved molblock", undefined, []),
    );
    renderMoleculeSvgMock.mockClear();
    compareInchiMock.mockClear();

    await user.click(screen.getByRole("button", { name: "Emit rotation" }));

    await waitFor(() =>
      expect(renderMoleculeSvgMock).toHaveBeenLastCalledWith(
        ocl,
        "rotated molblock",
        undefined,
        [],
      ),
    );
    expect(compareInchiMock).toHaveBeenLastCalledWith(rdkit, "CCO", "rotated molblock");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save depiction" })).toBeEnabled();
  });

  it("imports another substance's saved depiction as an analogue starting point", async () => {
    const ocl = { Molecule: {} };
    useOclMock.mockReturnValue({ ocl, error: null });
    useRdkitMock.mockReturnValue({ rdkit: {}, error: null });
    renderMoleculeSvgMock.mockReturnValue("<svg />");
    compareInchiMock.mockReturnValue({ match: false, inchiOriginal: "a", inchiEdited: "b" });
    useSubstanceLookupMock.mockReturnValue({
      lookup: [
        { slug: "example", name: "Example" },
        { slug: "donor", name: "Donor" },
      ],
      isLoading: false,
      status: "Exhausted",
    });
    useQueryMock.mockImplementation((query, args) => {
      const functionName = getFunctionName(query);
      if (functionName === "moleculeOverrides:listSlugs") {
        return [{ slug: "example" }, { slug: "donor" }];
      }
      if (functionName === "substanceIndex:getBySlug") {
        return args === "skip" ? undefined : { identification: { smiles: "CCO" } };
      }
      return undefined;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      const slug = url.includes("slug=donor") ? "donor" : "example";
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            override: {
              slug,
              molblock: `${slug} molblock`,
              svg: "<svg />",
              updatedAt: "2026-07-12T00:00:00.000Z",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
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
    expect(screen.getByText(/imported structure — unsaved/)).toBeInTheDocument();
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
    useSubstanceLookupMock.mockReturnValue({
      lookup: [{ slug: "example", name: "Example" }],
      isLoading: false,
      status: "Exhausted",
    });
    useQueryMock.mockImplementation((query, args) => {
      const functionName = getFunctionName(query);
      if (functionName === "moleculeOverrides:listSlugs") {
        return [{ slug: "example" }];
      }
      if (functionName === "substanceIndex:getBySlug") {
        return args === "skip" ? undefined : { identification: { smiles: "CCO" } };
      }
      return undefined;
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          override: {
            slug: "example",
            molblock: "saved molblock",
            svg: "<svg />",
            updatedAt: "2026-07-12T00:00:00.000Z",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

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

  it("keeps a canvas edit when Convex redelivers an equal article", async () => {
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
    useSubstanceLookupMock.mockReturnValue({
      lookup: [{ slug: "example", name: "Example" }],
      isLoading: false,
      status: "Exhausted",
    });
    useQueryMock.mockImplementation((query, args) => {
      const functionName = getFunctionName(query);
      if (functionName === "moleculeOverrides:listSlugs") {
        return [{ slug: "example" }];
      }
      if (functionName === "substanceIndex:getBySlug") {
        // A new-but-equal object every call, exactly like the real subscription.
        return args === "skip" ? undefined : { identification: { smiles: "CCO" } };
      }
      return undefined;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          override: {
            slug: "example",
            molblock: "saved molblock",
            svg: "<svg />",
            updatedAt: "2026-07-12T00:00:00.000Z",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

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
        undefined,
        [],
      ),
    );
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

  it("hands the class R-group label map to the canvas and preview without dirtying the baseline", async () => {
    // Seeded-class flow: no saved override, RDKit generates the Markush molblock.
    const rdkit = {
      get_mol: () => ({ get_molblock: () => RDKIT_PHENETHYLAMINE, delete: () => {} }),
    };
    useRdkitMock.mockReturnValue({ rdkit, error: null });
    renderMoleculeSvgMock.mockReturnValue("<svg />");
    compareCanonicalSmilesMock.mockReturnValue({
      match: true,
      inchiOriginal: "smiles",
      inchiEdited: "smiles",
    });
    useQueryMock.mockReturnValue(undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, override: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<MoleculeEditorTab />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Generic classes" }));
    await user.click(screen.getByRole("combobox", { name: "Select a class" }));
    await user.click(await screen.findByText("Phenethylamine"));

    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute(
        "data-source",
        RDKIT_PHENETHYLAMINE,
      ),
    );
    // The canvas gets the same draw-time map the brand preview uses: all eight
    // R positions, keyed by source atom index (atom 0 carries map 9 -> RN).
    const raw = screen.getByTestId("ocl-editor").getAttribute("data-atom-labels");
    const labels = JSON.parse(raw ?? "{}") as Record<string, string>;
    expect(labels["0"]).toBe("RN");
    expect(Object.values(labels).sort()).toEqual(
      ["R2", "R3", "R4", "R5", "R6", "RN", "Rα", "Rβ"].sort(),
    );
    await waitFor(() =>
      expect(renderMoleculeSvgMock).toHaveBeenLastCalledWith(
        expect.anything(),
        RDKIT_PHENETHYLAMINE,
        labels,
        [],
      ),
    );
    // Loading a seeded class row must not trip the unsaved-changes flag.
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });
});
