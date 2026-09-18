import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useMoleculeSourceReadMock = vi.hoisted(() => vi.fn());
const useRdkitMock = vi.hoisted(() => vi.fn());
const useOclMock = vi.hoisted(() => vi.fn());
const renderMoleculeSvgMock = vi.hoisted(() => vi.fn());
const compareInchiMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useEditorRead", () => ({
  useEditorRead: vi.fn(),
  useInvalidateEditorReads: () => async () => undefined,
}));
vi.mock("./useMoleculeSourceRead", () => ({
  useMoleculeSourceRead: useMoleculeSourceReadMock,
}));

vi.mock("./useRdkit", () => ({
  useRdkit: useRdkitMock,
}));

vi.mock("./useOcl", () => ({
  useOcl: useOclMock,
}));

vi.mock("./renderMoleculeSvg", () => ({
  renderMoleculeSvg: renderMoleculeSvgMock,
}));

vi.mock("./stereoGuard", () => ({
  compareInchi: compareInchiMock,
  compareCanonicalSmiles: vi.fn(),
}));

vi.mock("./OclEditor", () => ({
  OclEditor: ({
    source,
    onChange,
  }: {
    source: string | null;
    onChange: (molblock: string) => void;
  }) => (
    <div data-testid="ocl-editor" data-source={source ?? ""}>
      <button type="button" onClick={() => onChange("rotated molblock")}>
        Emit rotation
      </button>
    </div>
  ),
}));

import { MoleculeQuickEditor } from "./MoleculeQuickEditor";

function overrideResponse() {
  return new Response(
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
  );
}


describe("MoleculeQuickEditor", () => {
  beforeEach(() => {
    useRdkitMock.mockReturnValue({ rdkit: {}, error: null });
    useOclMock.mockReturnValue({ ocl: { Molecule: {} }, error: null });
    renderMoleculeSvgMock.mockReturnValue("<svg />");
    compareInchiMock.mockReturnValue({
      match: true,
      inchiOriginal: "InChI=1S/example",
      inchiEdited: "InChI=1S/example",
    });
    // The real hook retains its result identity until a source response arrives.
    useMoleculeSourceReadMock.mockReturnValue({ slug: "example", smiles: "CCO" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useMoleculeSourceReadMock.mockReset();
    useRdkitMock.mockReset();
    useOclMock.mockReset();
    renderMoleculeSvgMock.mockReset();
    compareInchiMock.mockReset();
  });

  it("loads the published depiction for its bound slug and gates Save on a real edit", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(overrideResponse()));

    render(<MoleculeQuickEditor slug="example" />);

    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "saved molblock"),
    );
    expect(fetchSpy).toHaveBeenCalledWith("/api/dev/molecule-override?slug=example");
    expect(screen.getByText("saved depiction")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save depiction" })).toBeDisabled();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Emit rotation" }));

    await waitFor(() =>
      expect(renderMoleculeSvgMock).toHaveBeenLastCalledWith(
        { Molecule: {} },
        "rotated molblock",
        undefined,
        [],
      ),
    );
    expect(compareInchiMock).toHaveBeenLastCalledWith({}, "CCO", "rotated molblock");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save depiction" })).toBeEnabled();
  });

  it("posts the edited depiction and re-reads the published row after a save", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      void input;
      return Promise.resolve(overrideResponse());
    });

    render(<MoleculeQuickEditor slug="example" />);
    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "saved molblock"),
    );
    await user.click(screen.getByRole("button", { name: "Emit rotation" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save depiction" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Save depiction" }));

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    const postCall = fetchSpy.mock.calls.find(([, init]) => init?.method === "POST");
    expect(postCall?.[0]).toBe("/api/dev/molecule-override");
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      slug: "example",
      molblock: "rotated molblock",
      svg: "<svg />",
      smiles: "CCO",
    });
    // the GET is issued again so "saved" comes back from the published row
    expect(
      fetchSpy.mock.calls.filter(([url]) => String(url).includes("?slug=example")),
    ).toHaveLength(2);
  });

  it("shows the no-structure notice when the article has no SMILES", async () => {
    useMoleculeSourceReadMock.mockReturnValue(null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, override: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<MoleculeQuickEditor slug="example" />);

    await waitFor(() => expect(screen.getByText("No structure to edit")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Save depiction" })).toBeDisabled();
  });

  it("surfaces a failed depiction load", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<MoleculeQuickEditor slug="example" />);

    await waitFor(() => expect(screen.getByText("Couldn't load depiction")).toBeInTheDocument());
    expect(screen.getByText("Unauthorized")).toBeInTheDocument();
  });
});
