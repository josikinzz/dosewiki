import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const useQueryMock = vi.hoisted(() => vi.fn());
const useRdkitMock = vi.hoisted(() => vi.fn());
const renderMoleculeSvgMock = vi.hoisted(() => vi.fn());
const compareInchiMock = vi.hoisted(() => vi.fn());
const compareCanonicalSmilesMock = vi.hoisted(() => vi.fn());

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

vi.mock("convex/react", () => ({
  useQuery: useQueryMock,
}));

vi.mock("./useRdkit", () => ({
  useRdkit: useRdkitMock,
}));

vi.mock("./renderMoleculeSvg", () => ({
  renderMoleculeSvg: renderMoleculeSvgMock,
}));

vi.mock("./stereoGuard", () => ({
  compareInchi: compareInchiMock,
  compareCanonicalSmiles: compareCanonicalSmilesMock,
}));

vi.mock("./OclEditor", () => ({
  OclEditor: ({
    source,
    fineRotation,
    mirrorDirection,
    snapRequest,
    onChange,
    onMirrorComplete,
    onSnapComplete,
    onSelectedBondCountChange,
  }: {
    source: string | null;
    fineRotation?: boolean;
    mirrorDirection?: string | null;
    snapRequest?: string | null;
    onChange: (molblock: string) => void;
    onMirrorComplete?: () => void;
    onSnapComplete?: (outcome: {
      kind: "bond-vertical" | "straighten";
      status: "applied";
      degrees: number;
    }) => void;
    onSelectedBondCountChange?: (count: number) => void;
  }) => (
    <div
      data-testid="ocl-editor"
      data-source={source ?? ""}
      data-fine-rotation={String(fineRotation)}
      data-mirror-direction={mirrorDirection ?? ""}
      data-snap-request={snapRequest ?? ""}
    >
      <button type="button" onClick={onMirrorComplete}>Complete mirror request</button>
      <button type="button" onClick={() => onChange("rotated molblock")}>Emit rotation</button>
      <button type="button" onClick={() => onSelectedBondCountChange?.(1)}>Select one bond</button>
      <button type="button" onClick={() => onSelectedBondCountChange?.(2)}>Select two bonds</button>
      <button
        type="button"
        onClick={() => onSnapComplete?.({ kind: "bond-vertical", status: "applied", degrees: 12.34 })}
      >
        Complete snap request
      </button>
    </div>
  ),
}));

import { MoleculeEditorTab } from "./MoleculeEditorTab";

describe("MoleculeEditorTab mount", () => {
  beforeEach(() => {
    useRdkitMock.mockReturnValue({ rdkit: null, error: null });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useQueryMock.mockReset();
    useRdkitMock.mockReset();
    renderMoleculeSvgMock.mockReset();
    compareInchiMock.mockReset();
    compareCanonicalSmilesMock.mockReset();
  });

  it("renders the editor panel header on mount", async () => {
    useQueryMock.mockReturnValue(undefined);
    render(<MoleculeEditorTab />);
    await waitFor(() =>
      expect(screen.getByText("Molecule depiction editor")).toBeInTheDocument(),
    );
  });

  it("separates the saved-depiction pill from the published-article pill", async () => {
    useQueryMock.mockImplementation((query) => {
      const functionName = getFunctionName(query);
      if (functionName === "substanceIndex:getLookup") {
        return [
          {
            slug: "listed-no-depiction",
            name: "Listed No Depiction",
            priority: "normal",
            psychoactiveClasses: ["Psychedelic"],
          },
          {
            slug: "unlisted-with-depiction",
            name: "Unlisted With Depiction",
            priority: "low",
            psychoactiveClasses: ["Stimulant"],
          },
        ];
      }
      if (functionName === "moleculeOverrides:listSlugs") {
        return [{ slug: "unlisted-with-depiction" }];
      }
      return undefined;
    });

    render(<MoleculeEditorTab />);
    expect(
      screen.getByText("2 substances · 1 saved depictions · 1 published articles"),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Select a substance" }));

    // The listed article leads the list under its category heading, carrying only
    // the article pill; the unlisted one carries only the depiction pill.
    expect(await screen.findByText("Psychedelic")).toBeInTheDocument();
    expect(screen.getByText("Stimulant · not publicly listed")).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
    expect(screen.getByText("saved")).toBeInTheDocument();
  });

  it("shows the substance loading state while Convex data is pending", () => {
    useQueryMock.mockReturnValue(undefined);
    render(<MoleculeEditorTab />);
    expect(screen.getByText("Loading substances…")).toBeInTheDocument();
  });

  it("loads 1,4-Butanediol without evaluating class-template membership", async () => {
    const savedMolblock = "saved molblock";
    useQueryMock.mockImplementation((query, args) => {
      const functionName = getFunctionName(query);
      if (functionName === "substanceIndex:getLookup") {
        return [{ slug: "1-4-butanediol", name: "1,4-Butanediol" }];
      }
      if (functionName === "moleculeOverrides:listSlugs") {
        return [{ slug: "1-4-butanediol" }];
      }
      if (functionName === "substanceIndex:getBySlug") {
        return args === "skip" ? undefined : { identification: { smiles: "C" } };
      }
      return undefined;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          override: {
            slug: "1-4-butanediol",
            molblock: savedMolblock,
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
    await user.click(await screen.findByText("1,4-Butanediol"));

    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", savedMolblock),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/dev/molecule-override?slug=1-4-butanediol",
    );
    expect(screen.queryByText("Couldn't load depiction")).not.toBeInTheDocument();
    const leftRightFlip = screen.getByRole("button", { name: "Flip left/right" });
    const upDownFlip = screen.getByRole("button", { name: "Flip up/down" });
    expect(leftRightFlip).toBeEnabled();
    expect(upDownFlip).toBeEnabled();

    const fineRotation = screen.getByRole("checkbox", { name: "Fine rotation" });
    expect(fineRotation).toBeChecked();
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-fine-rotation", "true");

    fineRotation.focus();
    await user.keyboard(" ");
    expect(fineRotation).not.toBeChecked();
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-fine-rotation", "false");
    expect(screen.getByRole("button", { name: "Save depiction" })).toBeDisabled();

    await user.click(leftRightFlip);
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-mirror-direction", "left-right");
    await user.click(screen.getByRole("button", { name: "Complete mirror request" }));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-mirror-direction", ""),
    );

    await user.click(upDownFlip);
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-mirror-direction", "up-down");
  });

  it("gates Set bond vertical behind a single selected bond and routes both alignment requests", async () => {
    useQueryMock.mockImplementation((query, args) => {
      const functionName = getFunctionName(query);
      if (functionName === "substanceIndex:getLookup") {
        return [{ slug: "example", name: "Example" }];
      }
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

    // Straighten needs no selection; Set bond vertical waits for exactly one bond.
    const setVertical = screen.getByRole("button", { name: "Set bond vertical" });
    const straighten = screen.getByRole("button", { name: "Straighten" });
    expect(straighten).toBeEnabled();
    expect(setVertical).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Select two bonds" }));
    expect(setVertical).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Select one bond" }));
    expect(setVertical).toBeEnabled();

    await user.click(setVertical);
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-snap-request", "bond-vertical");
    // Both alignment controls stay off while a request is in flight.
    expect(setVertical).toBeDisabled();
    expect(straighten).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Complete snap request" }));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-snap-request", ""),
    );
    expect(screen.getByText("Aligned")).toBeInTheDocument();
    expect(
      screen.getByText("Rotated 12° — the selected bond is now vertical. Save to publish."),
    ).toBeInTheDocument();

    await user.click(straighten);
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-snap-request", "straighten");
  });

  it("routes a rotation edit through preview, guard, dirty state, and the existing save gate", async () => {
    const rdkit = {};
    useRdkitMock.mockReturnValue({ rdkit, error: null });
    renderMoleculeSvgMock.mockReturnValue("<svg />");
    compareInchiMock.mockReturnValue({
      match: true,
      inchiOriginal: "InChI=1S/example",
      inchiEdited: "InChI=1S/example",
    });
    const lookup = [{ slug: "example", name: "Example" }];
    const overrideList = [{ slug: "example" }];
    const article = { identification: { smiles: "CCO" } };
    useQueryMock.mockImplementation((query, args) => {
      const functionName = getFunctionName(query);
      if (functionName === "substanceIndex:getLookup") {
        return lookup;
      }
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
      expect(renderMoleculeSvgMock).toHaveBeenLastCalledWith(rdkit, "saved molblock", undefined),
    );
    renderMoleculeSvgMock.mockClear();
    compareInchiMock.mockClear();

    await user.click(screen.getByRole("button", { name: "Emit rotation" }));

    await waitFor(() =>
      expect(renderMoleculeSvgMock).toHaveBeenLastCalledWith(
        rdkit,
        "rotated molblock",
        undefined,
      ),
    );
    expect(compareInchiMock).toHaveBeenLastCalledWith(rdkit, "CCO", "rotated molblock");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save depiction" })).toBeEnabled();
  });

  it("keeps a canvas edit when Convex redelivers an equal article", async () => {
    // A live query hands back a fresh object identity on every redelivery — a
    // resubscribe, or any write touching the row. That must not resolve the
    // baseline again and discard the drawing: the canvas is uncontrolled once
    // loaded, so a silent reset leaves the user looking at a depiction that is
    // no longer what Save publishes. This is how a rotation reached the canvas
    // but never the article.
    const rdkit = { get_mol: vi.fn() };
    useRdkitMock.mockReturnValue({ rdkit, error: null });
    renderMoleculeSvgMock.mockReturnValue("<svg />");
    compareInchiMock.mockReturnValue({ match: true });
    compareCanonicalSmilesMock.mockReturnValue({ match: true });
    useQueryMock.mockImplementation((query, args) => {
      const functionName = getFunctionName(query);
      if (functionName === "substanceIndex:getLookup") {
        return [{ slug: "example", name: "Example" }];
      }
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
        rdkit,
        "rotated molblock",
        undefined,
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
});
