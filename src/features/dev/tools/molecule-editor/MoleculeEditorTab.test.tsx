import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DESKTOP_ONLY_NOTICE } from "@/features/dev/components";
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
      expect(screen.getByText("Molecule depiction editor")).toBeInTheDocument(),
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
    expect(
      await screen.findByText("2 substances · 1 saved depictions · 1 published articles"),
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

  it("shows the substance loading state while server data is pending", () => {
    useQueryMock.mockReturnValue(undefined);
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    render(<MoleculeEditorTab />);
    expect(screen.getByText("Loading substances…")).toBeInTheDocument();
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

  it("keeps the drawing surface desktop-only while the picker and transforms work on a coarse pointer", async () => {
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
    expect(screen.getByText(DESKTOP_ONLY_NOTICE)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Select a substance" }));
    await user.click(await screen.findByText("Example"));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "saved molblock"),
    );

    // The notice stays in place of the toolbar; canvas-click modes and drawing
    // settings are gone, while the whole-depiction transforms still route to OCL.
    expect(screen.getByText(DESKTOP_ONLY_NOTICE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set bond vertical" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bold bonds" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Fine rotation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Trace an image…" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Select a structure to import" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Straighten" })).toBeEnabled(),
    );
    expect(screen.getByRole("button", { name: "Save depiction" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Flip left/right" }));
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-mirror-direction", "left-right");
  });

  it("shows no desktop notice on a fine pointer", async () => {
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
    await user.click(screen.getByRole("combobox", { name: "Select a substance" }));
    await user.click(await screen.findByText("Example"));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "saved molblock"),
    );

    expect(screen.queryByText(DESKTOP_ONLY_NOTICE)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set bond vertical" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Fine rotation" })).toBeInTheDocument();
  });
});
