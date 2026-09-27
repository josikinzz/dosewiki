import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  installMoleculeEditorTestHarness,
  seedExampleSubstance,
  stubMoleculeEditorFetch,
  stubOverrideFetch,
  useQueryMock,
} from "./MoleculeEditorTab.testHarness";
import { MoleculeEditorTab } from "./MoleculeEditorTab";

describe("MoleculeEditorTab modes", () => {
  installMoleculeEditorTestHarness();

  it("renders the editor panel header on mount", async () => {
    useQueryMock.mockReturnValue(undefined);
    render(<MoleculeEditorTab />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Molecules" })).toBeInTheDocument(),
    );
  });


  it("separates the saved-depiction pill from the published-article pill", async () => {
    useQueryMock.mockReturnValue(undefined);
    stubMoleculeEditorFetch({
      picker: [
        {
          slug: "listed-no-depiction",
          title: "Listed No Depiction",
          priority: "normal",
          index_categories: ["substance"],
          classification: { psychoactive_class: ["Psychedelic"] },
          hasOverride: false,
        },
        {
          slug: "unlisted-with-depiction",
          title: "Unlisted With Depiction",
          priority: "low",
          index_categories: [],
          classification: { psychoactive_class: ["Stimulant"] },
          hasOverride: true,
        },
      ],
    });

    render(<MoleculeEditorTab />);
    expect(await screen.findByText("2 substances, 1 edited")).toBeInTheDocument();

    // The listed article leads the list under its category heading; the unlisted
    // one says so. Publication and the depiction's state are separate marks.
    expect(await screen.findByText("Psychedelic")).toBeInTheDocument();
    expect(screen.getByText("Stimulant · not publicly listed")).toBeInTheDocument();
    const listed = screen.getByRole("button", { name: /^Listed No Depiction/ });
    expect(listed).toHaveTextContent("No depiction");
    expect(listed).not.toHaveTextContent("Not publicly listed");
    const unlisted = screen.getByRole("button", { name: /^Unlisted With Depiction/ });
    expect(unlisted).toHaveTextContent("Saved");
    expect(unlisted).toHaveTextContent("Not publicly listed");
  });

  it("shows the substance loading state while server data is pending", () => {
    useQueryMock.mockReturnValue(undefined);
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    render(<MoleculeEditorTab />);
    expect(screen.getByText("Loading substances")).toBeInTheDocument();
  });

  it("loads 1,4-Butanediol without evaluating class-template membership", async () => {
    const savedMolblock = "saved molblock";
    useQueryMock.mockReturnValue(undefined);
    const fetchSpy = stubMoleculeEditorFetch({
      picker: [{
        slug: "1-4-butanediol",
        title: "1,4-Butanediol",
        priority: "normal",
        index_categories: ["substance"],
        classification: null,
        hasOverride: true,
      }],
      sources: {
        "1-4-butanediol": {
          slug: "1-4-butanediol",
          smiles: "C",
        },
      },
      overrides: {
        "1-4-butanediol": {
          slug: "1-4-butanediol",
          molblock: savedMolblock,
          svg: "<svg />",
          updatedAt: "2026-07-12T00:00:00.000Z",
        },
      },
    });

    render(<MoleculeEditorTab />);
    const user = userEvent.setup();
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
    await waitFor(() => {
      expect(leftRightFlip).toBeEnabled();
      expect(upDownFlip).toBeEnabled();
    });

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

  it("locks the canvas on a coarse pointer until Draw, while the picker and transforms work by touch", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    seedExampleSubstance();
    stubOverrideFetch();

    render(<MoleculeEditorTab />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("Example"));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "saved molblock"),
    );

    // Until Draw, a swipe scrolls the page: canvas-click modes and tracing wait.
    expect(screen.getByText(/The canvas is locked so the page scrolls/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set bond vertical" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bold bonds" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trace an image" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Fine rotation" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Select a structure to import" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Straighten" })).toBeEnabled(),
    );
    expect(screen.getByRole("button", { name: "Save depiction" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Flip left/right" }));
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-mirror-direction", "left-right");

    // Draw unlocks the canvas and the bond-picking modes, which work by tap.
    await user.click(screen.getByRole("button", { name: "Draw on the canvas" }));
    expect(screen.getByRole("button", { name: "Done drawing" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Set bond vertical" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bold bonds" })).toBeInTheDocument();
  });

  it("draws straight away on a fine pointer", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(pointer: fine)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    seedExampleSubstance();
    stubOverrideFetch();

    render(<MoleculeEditorTab />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("Example"));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "saved molblock"),
    );

    expect(screen.queryByRole("button", { name: "Draw on the canvas" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set bond vertical" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Fine rotation" })).toBeInTheDocument();
  });
});
