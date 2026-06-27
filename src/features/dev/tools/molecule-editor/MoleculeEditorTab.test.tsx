import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The editor reads live Convex data via useQuery; stub it as "loading" (undefined)
// so the tab can mount without a ConvexProvider. This guards the regression where
// the Molecules tab failed to open at all.
vi.mock("convex/react", () => ({
  useQuery: () => undefined,
}));

import { MoleculeEditorTab } from "./MoleculeEditorTab";

describe("MoleculeEditorTab mount", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the editor panel header on mount", async () => {
    render(<MoleculeEditorTab />);
    await waitFor(() =>
      expect(screen.getByText("Molecule depiction editor")).toBeInTheDocument(),
    );
  });

  it("shows the substance loading state while Convex data is pending", () => {
    render(<MoleculeEditorTab />);
    expect(screen.getByText("Loading substances…")).toBeInTheDocument();
  });
});
