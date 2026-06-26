import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MoleculeEditorTab } from "./MoleculeEditorTab";

/**
 * Mounting the Molecules tab must not hang or crash: the editor panel header has to
 * appear immediately, independent of whether the RDKit renderer or the molecule list
 * have finished loading. Reproduces "click Molecules → waits → nothing happens".
 */
describe("MoleculeEditorTab mount", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ molecules: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the editor panel header on mount", async () => {
    render(<MoleculeEditorTab />);
    await waitFor(() =>
      expect(screen.getByText("Molecule depiction editor")).toBeInTheDocument(),
    );
  });
});
