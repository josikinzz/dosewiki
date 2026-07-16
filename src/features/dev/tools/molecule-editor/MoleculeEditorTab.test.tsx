import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const useQueryMock = vi.hoisted(() => vi.fn());

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

vi.mock("convex/react", () => ({
  useQuery: useQueryMock,
}));

vi.mock("./useRdkit", () => ({
  useRdkit: () => ({ rdkit: null, error: null }),
}));

vi.mock("./OclEditor", () => ({
  OclEditor: ({
    source,
    mirrorDirection,
    onMirrorComplete,
  }: {
    source: string | null;
    mirrorDirection?: string | null;
    onMirrorComplete?: () => void;
  }) => (
    <div
      data-testid="ocl-editor"
      data-source={source ?? ""}
      data-mirror-direction={mirrorDirection ?? ""}
    >
      <button type="button" onClick={onMirrorComplete}>Complete mirror request</button>
    </div>
  ),
}));

import { MoleculeEditorTab } from "./MoleculeEditorTab";

describe("MoleculeEditorTab mount", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useQueryMock.mockReset();
  });

  it("renders the editor panel header on mount", async () => {
    useQueryMock.mockReturnValue(undefined);
    render(<MoleculeEditorTab />);
    await waitFor(() =>
      expect(screen.getByText("Molecule depiction editor")).toBeInTheDocument(),
    );
  });

  it("shows the substance loading state while Convex data is pending", () => {
    useQueryMock.mockReturnValue(undefined);
    render(<MoleculeEditorTab />);
    expect(screen.getByText("Loading substances…")).toBeInTheDocument();
  });

  it("loads 1,4-Butanediol without evaluating class-template membership", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
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

    await user.click(leftRightFlip);
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-mirror-direction", "left-right");
    await user.click(screen.getByRole("button", { name: "Complete mirror request" }));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-mirror-direction", ""),
    );

    await user.click(upDownFlip);
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-mirror-direction", "up-down");
  });
});
